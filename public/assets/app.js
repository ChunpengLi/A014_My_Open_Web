const updatedDate = document.querySelector("#updated-date");

if (updatedDate) {
  updatedDate.textContent = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
  }).format(new Date());
}
