const BUCKET_NAME = "a014-my-open-web-uploads";
const FIRMWARE_KEY = "app/firmware.json";
const OPTIONS_KEY = "app/options.json";
const USERS_KEY = "app/users.json";
const SESSION_PREFIX = "app/sessions/";
const UPLOAD_PREFIX = "uploads/";
const SESSION_COOKIE = "fm_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 100000;
const ARCHIVE_EXTENSIONS = new Set([".zip", ".rar", ".7z"]);
const AI_DEFAULT_BASE_URL = "https://api.anthropic.com";
const AI_DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const AI_DEFAULT_MAX_TOKENS = 2048;
const AI_MAX_MESSAGE_TURNS = 20;
const AI_MAX_MESSAGE_CHARS = 12000;

const CATEGORY_LABELS = {
  firmware: "固件",
  software: "软件",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    if (url.pathname.startsWith("/seed/")) {
      return json({ message: "Not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleApi(request, env) {
  try {
    return await handleApiUnsafe(request, env);
  } catch (error) {
    console.error("API error", error);
    return json({
      message: "后端接口运行失败",
    }, 500);
  }
}

async function handleApiUnsafe(request, env) {
  if (!env.UPLOADS) {
    return json({ message: `R2 bucket binding UPLOADS is missing. Expected bucket: ${BUCKET_NAME}` }, 500);
  }

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  await ensureInitialState(request, env);

  if (url.pathname === "/api/auth/me" && method === "GET") {
    const user = await currentUser(request, env);
    return json({ user: publicUser(user) });
  }
  if (url.pathname === "/api/auth/login" && method === "POST") return login(request, env);
  if (url.pathname === "/api/auth/logout" && method === "POST") return logout(request, env);
  if (url.pathname === "/api/auth/register" && method === "POST") return register(request, env);

  const user = await currentUser(request, env);
  if (!user) return json({ message: "请先登录" }, 401);

  if (url.pathname === "/api/auth/pending-users" && method === "GET") {
    if (user.role !== "admin") return json({ message: "需要管理员权限" }, 403);
    const users = await getUsers(env);
    return json({ users: users.filter((item) => item.status === "pending").map(publicUser) });
  }

  const approveMatch = url.pathname.match(/^\/api\/auth\/users\/([^/]+)\/approve$/);
  if (approveMatch && method === "POST") {
    if (user.role !== "admin") return json({ message: "需要管理员权限" }, 403);
    return approveUser(env, approveMatch[1]);
  }

  if (url.pathname === "/api/meta" && method === "GET") return meta(env);
  if (url.pathname === "/api/firmwares" && method === "GET") return listRecords(url, env);
  if (url.pathname === "/api/firmwares" && method === "POST") return saveRecord(request, env);

  const recordMatch = url.pathname.match(/^\/api\/firmwares\/([^/]+)$/);
  if (recordMatch && method === "GET") return getRecord(env, recordMatch[1]);
  if (recordMatch && method === "PUT") return saveRecord(request, env, recordMatch[1]);
  if (recordMatch && method === "DELETE") return deleteRecord(env, recordMatch[1]);

  const downloadMatch = url.pathname.match(/^\/api\/firmwares\/([^/]+)\/download$/);
  if (downloadMatch && method === "GET") return downloadRecord(env, downloadMatch[1]);

  if (url.pathname === "/api/options" && method === "GET") return json(await getOptions(env));
  if (url.pathname === "/api/options" && method === "PUT") return updateOptions(request, env);
  if (url.pathname === "/api/restart" && method === "POST") {
    return json({ ok: true, message: "Cloudflare Worker 无需手动重启，部署后自动生效。" });
  }
  if (url.pathname === "/api/upgrade/status" && method === "GET") {
    return json({ running: false, ok: true, message: "公网版本通过 GitHub + Cloudflare 自动部署升级。", updatedAt: new Date().toISOString() });
  }
  if (url.pathname === "/api/upgrade" && method === "POST") {
    return json({ message: "公网版本不支持页面内自升级，请提交代码到 GitHub 触发 Cloudflare 部署。" }, 400);
  }
  if (url.pathname === "/api/ai/status" && method === "GET") {
    return aiStatus(env);
  }
  if (url.pathname === "/api/ai/chat" && method === "POST") {
    return aiChat(request, env);
  }
  if (url.pathname === "/api/ai/export/docx" && method === "POST") {
    return json({ message: "公网版本暂未配置 DOCX 导出。" }, 501);
  }

  return json({ message: "Not found" }, 404);
}

async function ensureInitialState(request, env) {
  const [firmware, options, users] = await Promise.all([
    env.UPLOADS.get(FIRMWARE_KEY),
    env.UPLOADS.get(OPTIONS_KEY),
    env.UPLOADS.get(USERS_KEY),
  ]);

  const writes = [];
  if (!firmware) writes.push(seedJsonFromAsset(request, env, "/seed/firmware.json", FIRMWARE_KEY, []));
  if (!options) writes.push(seedJsonFromAsset(request, env, "/seed/options.json", OPTIONS_KEY, defaultOptions()));
  if (!users) writes.push(seedUsers(env));
  await Promise.all(writes);

  const nextUsers = await getUsers(env);
  if (!nextUsers.some((user) => user.username === "lichunpeng")) {
    nextUsers.push(await adminUser());
    await putJson(env, USERS_KEY, nextUsers);
  }
}

async function seedJsonFromAsset(request, env, assetPath, key, fallback) {
  const assetUrl = new URL(assetPath, request.url);
  const response = await env.ASSETS.fetch(new Request(assetUrl));
  const value = response.ok ? await response.json() : fallback;
  await putJson(env, key, value);
}

async function seedUsers(env) {
  await putJson(env, USERS_KEY, [await adminUser()]);
}

async function adminUser() {
  return {
    id: crypto.randomUUID(),
    username: "lichunpeng",
    displayName: "lichunpeng",
    role: "admin",
    status: "active",
    passwordHash: await hashPassword("Lcp12345"),
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
  };
}

async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const users = await getUsers(env);
  const user = users.find((item) => item.username === username);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return json({ message: "用户名或密码错误" }, 401);
  }
  if (user.status !== "active") {
    return json({ message: "账号仍在等待管理员审批" }, 403);
  }

  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await putJson(env, `${SESSION_PREFIX}${tokenHash}.json`, { userId: user.id, expiresAt });

  return json(
    { user: publicUser(user) },
    200,
    { "Set-Cookie": cookieHeader(request, token, SESSION_SECONDS) },
  );
}

async function logout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) {
    await env.UPLOADS.delete(`${SESSION_PREFIX}${await sha256Hex(token)}.json`);
  }
  return json({ ok: true }, 200, { "Set-Cookie": cookieHeader(request, "", 0) });
}

async function register(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  if (!/^[a-z]{2,40}$/.test(username)) {
    return json({ message: "姓名全拼只能使用 2-40 个小写英文字母" }, 400);
  }
  if (password.length < 8) {
    return json({ message: "密码至少 8 位" }, 400);
  }

  const users = await getUsers(env);
  if (users.some((user) => user.username === username)) {
    return json({ message: "这个姓名全拼已经注册过" }, 409);
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    displayName: username,
    role: "user",
    status: "pending",
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
    approvedAt: "",
  };
  users.push(user);
  await putJson(env, USERS_KEY, users);
  return json({ ok: true, user: publicUser(user), message: "注册申请已提交，请等待管理员审批。" }, 201);
}

async function approveUser(env, userId) {
  const users = await getUsers(env);
  const user = users.find((item) => item.id === userId);
  if (!user) return json({ message: "用户不存在" }, 404);
  user.status = "active";
  user.approvedAt = new Date().toISOString();
  await putJson(env, USERS_KEY, users);
  return json({ ok: true, user: publicUser(user) });
}

async function currentUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const session = await getJson(env, `${SESSION_PREFIX}${await sha256Hex(token)}.json`, null);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  const users = await getUsers(env);
  return users.find((user) => user.id === session.userId && user.status === "active") || null;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    approvedAt: user.approvedAt,
  };
}

async function meta(env) {
  const records = await getRecords(env);
  const options = await getOptions(env);
  return json({
    categories: CATEGORY_LABELS,
    firmwareModels: options.models,
    gridModes: options.gridModes,
    scenarios: options.scenarios,
    softwareNames: options.softwareNames,
    archiveExtensions: Array.from(ARCHIVE_EXTENSIONS),
    storageRoot: "R2: uploads/firmware；uploads/software",
    storageRoots: {
      firmware: "R2 uploads/firmware",
      software: "R2 uploads/software",
    },
    total: records.length,
  });
}

async function listRecords(url, env) {
  const filters = {
    category: text(url.searchParams.get("category")),
    model: text(url.searchParams.get("model") || url.searchParams.get("pcsModel")).toLowerCase(),
    gridMode: text(url.searchParams.get("gridMode")),
    softwareName: text(url.searchParams.get("softwareName") || url.searchParams.get("softwareType")),
    version: text(url.searchParams.get("version")).toLowerCase(),
    keyword: text(url.searchParams.get("keyword")).toLowerCase(),
  };

  const records = (await getRecords(env)).filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.model && !splitList(item.model).map((value) => value.toLowerCase()).includes(filters.model)) return false;
    if (filters.gridMode && !splitList(item.gridMode).includes(filters.gridMode)) return false;
    if (filters.softwareName && item.softwareName !== filters.softwareName) return false;
    if (filters.version) {
      const versions = [item.version, item.cpu1Version, item.cpu2Version, item.fpgaVersion, item.armVersion].join(" ").toLowerCase();
      if (!versions.includes(filters.version)) return false;
    }
    if (filters.keyword) {
      const haystack = [
        CATEGORY_LABELS[item.category],
        item.model,
        item.scenario,
        item.cpu1Version,
        item.cpu2Version,
        item.fpgaVersion,
        item.armVersion,
        item.gridMode,
        item.applicableSingleVersion,
        item.applicableMultiVersion,
        item.applicableAutomationVersion,
        item.softwareName,
        item.version,
        item.enableDate,
        item.fileName,
        item.originalFileName,
        item.description,
      ].join(" ").toLowerCase();
      if (!haystack.includes(filters.keyword)) return false;
    }
    return true;
  });

  return json(sortRecords(records));
}

async function getRecord(env, id) {
  const record = (await getRecords(env)).find((item) => item.id === id);
  return record ? json(record) : json({ message: "未找到记录" }, 404);
}

async function saveRecord(request, env, id = "") {
  const form = await request.formData();
  const records = await getRecords(env);
  const existingIndex = id ? records.findIndex((item) => item.id === id) : -1;
  if (id && existingIndex === -1) return json({ message: "未找到记录" }, 404);

  const existing = existingIndex >= 0 ? records[existingIndex] : {};
  const record = {
    ...existing,
    ...buildRecordFromForm(form, existing),
    id: id || crypto.randomUUID(),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const file = form.get("packageFile") || form.get("firmwareFile");
  if (file && typeof file === "object" && file.size > 0) {
    const fileData = await storeFile(env, record, file);
    if (existing.relativePath && existing.relativePath !== fileData.relativePath) {
      await env.UPLOADS.delete(uploadKey(existing.relativePath));
    }
    Object.assign(record, fileData);
  } else if (!existing.relativePath) {
    return json({ message: "请选择要上传的压缩包" }, 400);
  }

  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.push(record);
  }

  await putJson(env, FIRMWARE_KEY, sortRecords(records));
  return json(record, existingIndex >= 0 ? 200 : 201);
}

async function deleteRecord(env, id) {
  const records = await getRecords(env);
  const index = records.findIndex((item) => item.id === id);
  if (index === -1) return json({ message: "未找到记录" }, 404);
  const [record] = records.splice(index, 1);
  if (record.relativePath) await env.UPLOADS.delete(uploadKey(record.relativePath));
  await putJson(env, FIRMWARE_KEY, records);
  return json({ ok: true });
}

async function downloadRecord(env, id) {
  const record = (await getRecords(env)).find((item) => item.id === id);
  if (!record) return json({ message: "未找到记录" }, 404);
  const object = await env.UPLOADS.get(uploadKey(record.relativePath));
  if (!object) {
    return json({ message: "R2 中还没有这个文件。请先运行上传迁移脚本，把压缩包里的 uploads/ 导入 R2。" }, 404);
  }
  return new Response(object.body, {
    headers: {
      "Content-Type": record.mimeType || object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Length": String(object.size || record.fileSize || ""),
      "Content-Disposition": contentDisposition(record.originalFileName || record.fileName || "download.bin"),
    },
  });
}

async function updateOptions(request, env) {
  const current = await getOptions(env);
  const body = await request.json().catch(() => ({}));
  const next = {
    models: cleanList(body.models || current.models),
    scenarios: cleanList(body.scenarios || current.scenarios),
    gridModes: cleanList(body.gridModes || current.gridModes),
    softwareNames: cleanList(body.softwareNames || current.softwareNames),
  };
  await putJson(env, OPTIONS_KEY, next);
  return json({ ok: true, options: next, changes: { affectedRecords: 0 } });
}

async function aiStatus(env) {
  const config = aiConfig(env);
  return json({
    configured: Boolean(config),
    model: config?.model || env.AI_MODEL || AI_DEFAULT_MODEL,
    maxTokens: config?.maxTokens || Number(env.AI_MAX_TOKENS || AI_DEFAULT_MAX_TOKENS),
    recordCount: (await getRecords(env)).length,
  });
}

async function aiChat(request, env) {
  const config = aiConfig(env);
  if (!config) {
    return json({ message: "AI 未配置：请先把 ANTHROPIC_AUTH_TOKEN 写入 Cloudflare Secret。" }, 503);
  }

  const body = await request.json().catch(() => ({}));
  const messages = normalizeAiMessages(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ message: "请输入要提问的内容。" }, 400);
  }

  const upstream = await fetch(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.authToken,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      stream: true,
      system: await buildAiSystemPrompt(env),
      messages,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errorText = await upstream.text().catch(() => "");
    return eventStream(`AI 助手返回错误（HTTP ${upstream.status}）：${aiSliceError(errorText) || upstream.statusText}`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
            const rawLine = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            const line = rawLine.replace(/\r$/, "").trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            const parsed = parseJson(payload, null);
            if (parsed?.type === "content_block_delta" && typeof parsed.delta?.text === "string") {
              enqueueSse(controller, "delta", { text: parsed.delta.text });
            } else if (parsed?.type === "error" && parsed.error) {
              enqueueSse(controller, "error", { message: parsed.error.message || "AI 助手返回错误。" });
            }
          }
        }
        enqueueSse(controller, "done", {});
      } catch (error) {
        enqueueSse(controller, "error", { message: `AI 请求失败：${error?.message || String(error)}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function aiConfig(env) {
  const authToken = text(env.ANTHROPIC_AUTH_TOKEN);
  if (!authToken) return null;
  const maxTokens = Number(env.AI_MAX_TOKENS || AI_DEFAULT_MAX_TOKENS);
  return {
    authToken,
    baseUrl: text(env.ANTHROPIC_BASE_URL || AI_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: text(env.AI_MODEL || AI_DEFAULT_MODEL),
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : AI_DEFAULT_MAX_TOKENS,
  };
}

async function buildAiSystemPrompt(env) {
  const [records, options] = await Promise.all([getRecords(env), getOptions(env)]);
  const context = JSON.stringify(sortRecords(records).map(compactAiRecord));
  const optionsContext = JSON.stringify({
    软件名称可选项: options.softwareNames,
    机型可选项: options.models,
    适用场景可选项: options.scenarios,
    运行模式可选项: options.gridModes,
  });
  return [
    "你是“固件与软件包管理系统”内置的 AI 助手，只基于系统中已登记的固件与软件记录作答。",
    "严格依据 <repository> 内的 JSON 记录，不要编造不存在的机型、版本、文件或日期。",
    "当用户问“最新/最近”时，以记录里的启用日期排序。",
    "回答全部使用中文，优先使用简洁要点列表，避免 Markdown 表格。",
    "涉及具体记录时，给出适用机型、版本号、启用日期、文件名等关键字段，方便核对与下载。",
    "如果用户想下载文件，请单独输出一行下载标记：[[DOWNLOAD id=\"记录id\" name=\"显示名\"]]。id 必须来自 repository，不要自己编造。",
    "如果问题超出已登记记录范围，请明确说明系统中没有对应资料，并建议去管理页面补充记录。",
    "",
    `<repository>\n${context}\n</repository>`,
    "",
    `<options>\n${optionsContext}\n</options>`,
  ].join("\n");
}

function compactAiRecord(record) {
  if (record.category === "software") {
    return {
      id: record.id,
      类别: "软件",
      软件名称: record.softwareName,
      版本号: record.version,
      适用机型: record.model,
      适用场景: record.scenario,
      启用日期: record.enableDate,
      说明: record.description,
      文件名: record.originalFileName || record.fileName,
      源码SVN: record.sourceSvn,
    };
  }
  return {
    id: record.id,
    类别: "固件",
    适用机型: record.model,
    适用场景: record.scenario,
    CPU1: record.cpu1Version,
    CPU2: record.cpu2Version,
    FPGA: record.fpgaVersion,
    ARM: record.armVersion,
    运行模式: record.gridMode,
    启用日期: record.enableDate,
    适用单机版本: record.applicableSingleVersion,
    适用多机版本: record.applicableMultiVersion,
    适用自动化版本: record.applicableAutomationVersion,
    说明: record.description,
    文件名: record.originalFileName || record.fileName,
  };
}

function normalizeAiMessages(incoming) {
  if (!Array.isArray(incoming)) return [];
  const cleaned = [];
  for (const item of incoming) {
    const role = item?.role === "assistant" ? "assistant" : "user";
    const content = text(item?.content).slice(0, AI_MAX_MESSAGE_CHARS);
    if (!content) continue;
    const last = cleaned[cleaned.length - 1];
    if (last?.role === role) {
      last.content = `${last.content}\n${content}`.slice(0, AI_MAX_MESSAGE_CHARS);
    } else {
      cleaned.push({ role, content });
    }
    if (cleaned.length >= AI_MAX_MESSAGE_TURNS) break;
  }
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift();
  return cleaned;
}

function enqueueSse(controller, event, data) {
  controller.enqueue(utf8(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

function aiSliceError(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 400);
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildRecordFromForm(form, existing = {}) {
  const category = text(form.get("category") || existing.category || "firmware");
  if (!CATEGORY_LABELS[category]) throw new Error("分类无效");
  const base = {
    category,
    description: text(form.get("description")),
  };
  if (category === "software") {
    return {
      ...base,
      softwareName: required(form, "softwareName", "软件名称"),
      version: required(form, "version", "版本号"),
      model: required(form, "model", "适用机型"),
      scenario: required(form, "scenario", "适用场景"),
      enableDate: text(form.get("enableDate")),
      sourceSvn: text(form.get("sourceSvn")),
      cpu1Version: "",
      cpu2Version: "",
      fpgaVersion: "",
      armVersion: "",
      gridMode: "",
      applicableSingleVersion: "",
      applicableMultiVersion: "",
      applicableAutomationVersion: "",
      cpu1SourceSvn: "",
      cpu2SourceSvn: "",
      fpgaSourceSvn: "",
      armSourceSvn: "",
    };
  }
  return {
    ...base,
    model: required(form, "model", "机型"),
    scenario: required(form, "scenario", "使用场景"),
    cpu1Version: required(form, "cpu1Version", "CPU1 版本号"),
    cpu2Version: required(form, "cpu2Version", "CPU2 版本号"),
    fpgaVersion: required(form, "fpgaVersion", "FPGA 版本号"),
    armVersion: required(form, "armVersion", "ARM 版本号"),
    cpu1SourceSvn: text(form.get("cpu1SourceSvn")),
    cpu2SourceSvn: text(form.get("cpu2SourceSvn")),
    fpgaSourceSvn: text(form.get("fpgaSourceSvn")),
    armSourceSvn: text(form.get("armSourceSvn")),
    enableDate: text(form.get("enableDate")),
    gridMode: text(form.get("gridMode")),
    applicableSingleVersion: text(form.get("applicableSingleVersion")),
    applicableMultiVersion: text(form.get("applicableMultiVersion")),
    applicableAutomationVersion: text(form.get("applicableAutomationVersion")),
    softwareName: "",
    version: "",
    sourceSvn: "",
  };
}

async function storeFile(env, record, file) {
  validateArchive(file.name);
  const relativePath = buildStoragePath(record, file.name);
  const key = uploadKey(relativePath);
  await env.UPLOADS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { originalFileName: file.name },
  });
  return {
    fileName: sanitizeName(file.name),
    originalFileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
    relativePath,
  };
}

function buildStoragePath(record, originalName) {
  const fileName = sanitizeName(originalName);
  if (record.category === "software") {
    return [
      "software",
      segment(record.softwareName),
      segment(record.model),
      segment(record.scenario),
      `${segment(record.version)}_${segment(record.enableDate)}`,
      fileName,
    ].join("/");
  }
  return [
    "firmware",
    segment(record.model),
    segment(record.scenario),
    [record.cpu1Version, record.cpu2Version, record.fpgaVersion, record.armVersion, record.enableDate].map(segment).filter(Boolean).join("_") || "versions",
    fileName,
  ].join("/");
}

function uploadKey(relativePath) {
  return `${UPLOAD_PREFIX}${String(relativePath || "").replace(/^uploads\//, "")}`;
}

function validateArchive(name) {
  const lower = String(name || "").toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  if (!ARCHIVE_EXTENSIONS.has(ext)) throw new Error("请上传 .zip、.rar 或 .7z 压缩包");
}

async function getRecords(env) {
  return getJson(env, FIRMWARE_KEY, []);
}

async function getOptions(env) {
  return getJson(env, OPTIONS_KEY, defaultOptions());
}

async function getUsers(env) {
  return getJson(env, USERS_KEY, []);
}

async function getJson(env, key, fallback) {
  const object = await env.UPLOADS.get(key);
  if (!object) return fallback;
  try {
    return await object.json();
  } catch {
    return fallback;
  }
}

async function putJson(env, key, value) {
  await env.UPLOADS.put(key, JSON.stringify(value, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

async function hashPassword(password) {
  const salt = randomHex(16);
  const hash = await pbkdf2(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

async function verifyPassword(password, stored) {
  const [algorithm, iterations, salt, expected] = String(stored || "").split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterations || !salt || !expected) return false;
  const actual = await pbkdf2(password, salt, Number(iterations));
  return timingSafeEqual(actual, expected);
}

async function pbkdf2(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", utf8(value));
  return bytesToHex(new Uint8Array(digest));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

function cookieHeader(request, value, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAge}`;
}

function eventStream(message) {
  const encoder = new TextEncoder();
  return new Response(encoder.encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function required(form, key, label) {
  const value = text(form.get(key));
  if (!value) throw new Error(`请选择或填写${label}`);
  return value;
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeUsername(value) {
  return text(value).toLowerCase();
}

function cleanList(values) {
  return Array.isArray(values) ? values.map(text).filter(Boolean) : [];
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const dateCompare = String(b.enableDate || "").localeCompare(String(a.enableDate || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

function defaultOptions() {
  return {
    models: ["未分类"],
    scenarios: ["未分类"],
    gridModes: ["未分类"],
    softwareNames: ["未分类"],
  };
}

function sanitizeName(value) {
  return String(value || "file.bin").replace(/[\\/:*?"<>|]/g, "_").trim() || "file.bin";
}

function segment(value) {
  return sanitizeName(value).replace(/\s+/g, "_").replace(/,+/g, ",").slice(0, 120) || "unknown";
}

function contentDisposition(fileName) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function randomHex(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function utf8(value) {
  return new TextEncoder().encode(String(value));
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
