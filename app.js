const DAY_NAMES = {
  lunes: "Lunes", martes: "Martes", miercoles: "Miércoles",
  jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo"
};
const TYPE_INFO = {
  class: { label: "Clase", icon: "📘" },
  break: { label: "Recreo", icon: "🔔" },
  night: { label: "Noche", icon: "🌙" },
  event: { label: "Evento / Otro", icon: "⭐" }
};
const STORAGE_KEY = "dawningSchoolGuide.v3";

function makeId() {
  return (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function activity(name, type = "class", duration = 30) {
  return { id: makeId(), name, type, duration };
}
function createDefaults() {
  const makeDay = (subjects) => [
  activity(subjects[0], "class", 10),
  activity(subjects[1], "class", 10),
  activity("Recreo", "break", 10),
  activity(subjects[2], "class", 10),
  activity("Bus escolar", "event", 5),
  activity("Noche", "night", 15)
];
  return {
    lunes: makeDay(["Matemática", "Lenguaje", "Historia"]),
    martes: makeDay(["Ciencias naturales", "Inglés", "Artes visuales"]),
    miercoles: makeDay(["Música", "Matemática", "Ciencias naturales"]),
    jueves: makeDay(["Historia", "Lenguaje", "Inglés"]),
    viernes: makeDay(["Artes visuales", "Música", "Matemática"]),
    sabado: makeDay(["Lenguaje", "Ciencias naturales", "Artes visuales"]),
    domingo: makeDay(["Inglés", "Historia", "Música"])
  };
}
let schedules = loadSchedules();
let selectedDay = "lunes";
let currentIndex = 0;
let remainingSeconds = 0;
let totalSeconds = 0;
let timerInterval = null;
let running = false;
let editingId = null;
let toastTimeout = null;

const $ = (id) => document.getElementById(id);
const daySelect = $("daySelect");
const activityList = $("activityList");
const activityDialog = $("activityDialog");
const activityForm = $("activityForm");

function loadSchedules() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createDefaults();
    const parsed = JSON.parse(saved);
    const defaults = createDefaults();
    for (const day of Object.keys(DAY_NAMES)) {
      if (!Array.isArray(parsed[day])) parsed[day] = defaults[day];
      parsed[day] = parsed[day].filter(item => item && typeof item.name === "string")
        .map(item => ({
          id: item.id || makeId(),
          name: item.name,
          type: TYPE_INFO[item.type] ? item.type : "class",
          duration: clamp(Number(item.duration) || (item.type === "night" ? 15 : item.name === "Bus escolar" ? 5 : 10), 1, 1440)
        }));
    }
    return parsed;
  } catch {
    return createDefaults();
  }
}
function saveSchedules() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
  $("saveStatus").textContent = "✓ Guardado localmente";
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function currentSchedule() {
  return schedules[selectedDay];
}
function currentActivityItem() {
  return currentSchedule()[currentIndex] || null;
}
function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  running = false;
}
function resetClockForCurrent() {
  stopTimer();
  const item = currentActivityItem();
  totalSeconds = item ? item.duration * 60 : 0;
  remainingSeconds = totalSeconds;
  renderTimer();
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2300);
}
function renderAll() {
  $("currentDayChip").textContent = DAY_NAMES[selectedDay];
  renderActivities();
  renderTimer();
}
function renderActivities() {
  activityList.innerHTML = "";
  const items = currentSchedule();
  if (items.length === 0) {
    activityList.innerHTML = '<div class="empty-state">Este día no tiene actividades. Pulsa <strong>“Añadir actividad”</strong> para crear el horario.</div>';
    return;
  }
  items.forEach((item, index) => {
    const info = TYPE_INFO[item.type] || TYPE_INFO.class;
    const card = document.createElement("article");
    card.className = "activity-card";
    card.innerHTML = `
      <div class="activity-number">${index + 1}</div>
      <div class="activity-name"></div>
      <div class="type-pill">${info.icon} ${info.label}</div>
      <div class="activity-meta">${item.duration} min</div>
      <div class="card-actions">
        <button class="icon-button" data-action="up" title="Mover arriba" aria-label="Mover ${escapeHtml(item.name)} arriba" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-button" data-action="down" title="Mover abajo" aria-label="Mover ${escapeHtml(item.name)} abajo" ${index === items.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icon-button" data-action="edit" title="Editar" aria-label="Editar ${escapeHtml(item.name)}">✎</button>
        <button class="icon-button" data-action="delete" title="Eliminar" aria-label="Eliminar ${escapeHtml(item.name)}">🗑</button>
      </div>`;
    card.querySelector(".activity-name").textContent = item.name;
    card.querySelectorAll("button").forEach(button => {
      button.addEventListener("click", () => handleCardAction(button.dataset.action, item.id));
    });
    if (index === currentIndex) card.style.borderColor = "#9586ff";
    activityList.appendChild(card);
  });
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
function renderTimer() {
  const item = currentActivityItem();
  const items = currentSchedule();
  $("currentDayChip").textContent = DAY_NAMES[selectedDay];
  if (!item) {
    $("currentActivity").textContent = "Sin actividades";
    $("timerDisplay").textContent = "00:00";
    $("timerState").textContent = "AÑADE UNA ACTIVIDAD PARA COMENZAR";
    $("nextActivity").textContent = "No hay actividades programadas.";
    $("progressFill").style.width = "0%";
    $("startPauseBtn").textContent = "▶ Iniciar";
    $("startPauseBtn").disabled = true;
    $("nextBtn").disabled = true;
    $("restartBtn").disabled = true;
    return;
  }
  $("startPauseBtn").disabled = false;
  $("nextBtn").disabled = items.length < 2;
  $("restartBtn").disabled = false;
  $("currentActivity").textContent = `${TYPE_INFO[item.type].icon} ${item.name}`;
  $("timerDisplay").textContent = formatTime(remainingSeconds);
  $("timerState").textContent = running ? "TEMPORIZADOR EN MARCHA" : (remainingSeconds === 0 && totalSeconds > 0 ? "ACTIVIDAD TERMINADA" : "LISTO / EN PAUSA");
  const next = items[(currentIndex + 1) % items.length];
  $("nextActivity").textContent = items.length > 1 ? `Siguiente: ${next.name}` : "Solo hay una actividad en este horario.";
  const progress = totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;
  $("progressFill").style.width = `${clamp(progress, 0, 100)}%`;
  $("startPauseBtn").textContent = running ? "⏸ Pausar" : (remainingSeconds === 0 ? "▶ Volver a iniciar" : "▶ Iniciar");
}
function startTimer() {
  if (!currentActivityItem()) return;
  if (remainingSeconds <= 0) remainingSeconds = totalSeconds || currentActivityItem().duration * 60;
  running = true;
  const endAt = Date.now() + remainingSeconds * 1000;
  stopTimer();
  running = true;
  timerInterval = setInterval(() => {
    remainingSeconds = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (remainingSeconds <= 0) {
      stopTimer();
      renderTimer();
      showToast(`Terminó: ${currentActivityItem()?.name || "actividad"}`);
      if (currentSchedule().length > 1) {
        advanceActivity(true);
      }
      return;
    }
    renderTimer();
  }, 250);
  renderTimer();
}
function toggleTimer() {
  if (running) {
    // Preserve the displayed remaining time before stopping the interval.
    stopTimer();
    renderTimer();
  } else {
    startTimer();
  }
}
function advanceActivity(auto = false) {
  stopTimer();
  const items = currentSchedule();
  if (!items.length) {
    resetClockForCurrent();
    renderAll();
    return;
  }
  currentIndex = (currentIndex + 1) % items.length;
  resetClockForCurrent();
  renderAll();
  if (auto) startTimer();
}
function handleCardAction(action, id) {
  const items = currentSchedule();
  const index = items.findIndex(item => item.id === id);
  if (index < 0) return;
  if (action === "edit") openEditor(id);
  if (action === "delete") {
    const name = items[index].name;
    items.splice(index, 1);
    if (index < currentIndex) currentIndex--;
    if (currentIndex >= items.length) currentIndex = Math.max(0, items.length - 1);
    resetClockForCurrent();
    saveSchedules();
    renderAll();
    showToast(`Se eliminó “${name}”`);
  }
  if (action === "up" && index > 0) {
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    if (currentIndex === index) currentIndex--;
    else if (currentIndex === index - 1) currentIndex++;
    saveSchedules(); renderAll();
  }
  if (action === "down" && index < items.length - 1) {
    [items[index + 1], items[index]] = [items[index], items[index + 1]];
    if (currentIndex === index) currentIndex++;
    else if (currentIndex === index + 1) currentIndex--;
    saveSchedules(); renderAll();
  }
}
function openEditor(id = null) {
  editingId = id;
  const item = id ? currentSchedule().find(entry => entry.id === id) : null;
  $("dialogTitle").textContent = item ? "Editar actividad" : "Añadir actividad";
  $("activityName").value = item?.name || "";
  $("activityType").value = item?.type || "class";
  $("activityDuration").value = item?.duration || (item?.type === "night" ? 15 : item?.name === "Bus escolar" ? 5 : 10);
  activityDialog.showModal();
  $("activityName").focus();
}
function closeEditor() {
  activityDialog.close();
  editingId = null;
}
function saveActivityFromForm(event) {
  event.preventDefault();
  const name = $("activityName").value.trim();
  const type = $("activityType").value;
  const duration = Number($("activityDuration").value);
  if (!name) {
    showToast("Escribe un nombre para la actividad.");
    return;
  }
  if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
    showToast("La duración debe ser de 1 a 1440 minutos.");
    return;
  }
  const items = currentSchedule();
  if (editingId) {
    const index = items.findIndex(item => item.id === editingId);
    if (index >= 0) items[index] = { ...items[index], name, type, duration };
    if (index === currentIndex) resetClockForCurrent();
  } else {
    items.push(activity(name, type, duration));
    if (items.length === 1) {
      currentIndex = 0;
      resetClockForCurrent();
    }
  }
  saveSchedules();
  closeEditor();
  renderAll();
  showToast("Actividad guardada.");
}
function changeDay() {
  stopTimer();
  selectedDay = daySelect.value;
  currentIndex = 0;
  resetClockForCurrent();
  renderAll();
}
function clearCurrentDay() {
  if (!confirm(`¿Vaciar todas las actividades del ${DAY_NAMES[selectedDay]}? Esta acción no se puede deshacer.`)) return;
  stopTimer();
  schedules[selectedDay] = [];
  currentIndex = 0;
  resetClockForCurrent();
  saveSchedules();
  renderAll();
  showToast("Horario del día vaciado.");
}
function restoreDefaults() {
  if (!confirm("¿Restaurar todos los horarios de ejemplo? Se perderán tus cambios actuales.")) return;
  stopTimer();
  schedules = createDefaults();
  selectedDay = daySelect.value;
  currentIndex = 0;
  resetClockForCurrent();
  saveSchedules();
  renderAll();
  showToast("Horarios de ejemplo restaurados.");
}

daySelect.addEventListener("change", changeDay);
$("startPauseBtn").addEventListener("click", toggleTimer);
$("nextBtn").addEventListener("click", () => advanceActivity(false));
$("restartBtn").addEventListener("click", () => {
  resetClockForCurrent();
  renderTimer();
  showToast("Actividad reiniciada.");
});
$("addActivityBtn").addEventListener("click", () => openEditor());
$("saveDayBtn").addEventListener("click", () => {
  saveSchedules();
  showToast(`Horario del ${DAY_NAMES[selectedDay]} guardado.`);
});
$("clearDayBtn").addEventListener("click", clearCurrentDay);
$("resetAllBtn").addEventListener("click", restoreDefaults);
activityForm.addEventListener("submit", saveActivityFromForm);
$("cancelDialogBtn").addEventListener("click", closeEditor);
activityDialog.addEventListener("click", event => {
  if (event.target === activityDialog) closeEditor();
});

resetClockForCurrent();
renderAll();

renderAll();
