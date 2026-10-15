/* RPA 이슈관리 - 화면 보조 스크립트 (외부 라이브러리 없음) */

(function () {
  "use strict";

  /* ------------------------------------------------ 삭제 확인 */
  document.addEventListener("submit", function (e) {
    var form = e.target;
    var msg = form.getAttribute("data-confirm");
    if (msg && !window.confirm(msg)) {
      e.preventDefault();
    }
  });

  /* ------------------------------------------------ 사이트 → 과제 연동 */
  var siteSel = document.getElementById("site_id");
  var taskSel = document.getElementById("task_id");

  function loadTasks(siteId, keepValue) {
    if (!taskSel) return;
    taskSel.innerHTML = '<option value="">(선택 안 함)</option>';
    if (!siteId) return;
    fetch("/api/sites/" + encodeURIComponent(siteId) + "/tasks", {
      credentials: "same-origin",
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (tasks) {
        tasks.forEach(function (t) {
          var o = document.createElement("option");
          o.value = t.id;
          o.textContent = t.name;
          if (String(keepValue) === String(t.id)) o.selected = true;
          taskSel.appendChild(o);
        });
      })
      .catch(function () { /* 네트워크 오류 시 그냥 빈 목록 */ });
  }

  if (siteSel && taskSel) {
    var initial = taskSel.getAttribute("data-selected") || "";
    if (siteSel.value) loadTasks(siteSel.value, initial);
    siteSel.addEventListener("change", function () {
      loadTasks(siteSel.value, "");
      scheduleSimilar();
    });
  }

  /* ------------------------------------------------ 유사 이슈 실시간 조회 */
  var box = document.getElementById("similar-box");
  var timer = null;

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : "";
  }

  function fetchSimilar() {
    if (!box) return;
    var title = fieldValue("title");
    var symptom = fieldValue("symptom");
    var tags = fieldValue("tags");

    if (title.trim().length < 2 && symptom.trim().length < 4 && !tags.trim()) {
      box.innerHTML = '<div class="empty">제목이나 증상을 입력하면 비슷한 이슈를 찾아 보여줍니다.</div>';
      return;
    }

    var params = new URLSearchParams({
      title: title,
      symptom: symptom.slice(0, 2000),
      tags: tags,
      type_id: fieldValue("type_id"),
      site_id: fieldValue("site_id"),
      exclude: box.getAttribute("data-exclude") || "",
      target: box.getAttribute("data-copy-target") || "",
    });

    box.setAttribute("aria-busy", "true");
    fetch("/issues/similar?" + params.toString(), { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (html) {
        if (html) box.innerHTML = html;
        box.removeAttribute("aria-busy");
      })
      .catch(function () { box.removeAttribute("aria-busy"); });
  }

  function scheduleSimilar() {
    if (!box) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(fetchSimilar, 450);
  }

  ["title", "symptom", "tags", "type_id"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", scheduleSimilar);
      el.addEventListener("change", scheduleSimilar);
    }
  });

  if (box && (fieldValue("title") || fieldValue("symptom"))) {
    fetchSimilar();
  }

  /* ------------------------------------------------ 조치내용 가져오기 */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-copy-action]");
    if (!btn) return;
    e.preventDefault();
    var target = document.getElementById(btn.getAttribute("data-target") || "content");
    if (!target) return;
    var text = btn.getAttribute("data-copy-action") || "";
    var ref = btn.getAttribute("data-ref") || "";
    var prefix = target.value.trim() ? target.value.trimEnd() + "\n\n" : "";
    target.value = prefix + (ref ? "[" + ref + " 참고]\n" : "") + text;
    target.focus();
    target.setSelectionRange(target.value.length, target.value.length);
  });

  /* ------------------------------------------------ 점검: 전체 정상 처리 */
  var allOk = document.getElementById("mark-all-ok");
  if (allOk) {
    allOk.addEventListener("click", function (e) {
      e.preventDefault();
      document.querySelectorAll('input[type=radio][value="OK"]').forEach(function (r) {
        r.checked = true;
      });
    });
  }
})();
