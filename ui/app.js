import { initialize, callTool, openCodex, subscribe } from "../src/client.js";
import { parseCapture, setCaptureProject, setCaptureStatus } from "../src/capture.js";
import { startTaskCompletion } from "./completion.js";

const $ = (id) => document.getElementById(id);
const statuses = ["today", "backlog"];
const statusNames = { today: "Today", backlog: "Backlog" };
const icons = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  edit: '<path d="m15 5 4 4M5 15l-1 5 5-1L20 8a2.83 2.83 0 0 0-4-4Z"/>'
};
let board = { tasks: [], projects: [], revision: 0 };
let ready = false;
let loading = false;
let captureBusy = false;
let captureDefaultStatus = "backlog";
let captureManualProjectId = null;
let confirmedProject = null;
let editingTaskId = null;
let confirmation = null;
let toastTimer;
let toastRemaining = 5500;
let toastStartedAt = 0;
let toastAction = null;
const busyTasks = new Set();
const rowErrors = new Map();
const completingTasks = new Map();

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = icons[name];
  return svg;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Something went wrong. Please try again.";
}

function setError(id, error) {
  $(id).textContent = error ? errorMessage(error) : "";
  $(id).hidden = !error;
}

function ideaText(task) {
  return [task.title, task.notes].filter(Boolean).join("\n\n");
}

function taskLabel(task) {
  const text = task.title?.split("\n")[0] || "this task";
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

function taskSection(task) {
  return (task.status === "done" ? task.previousStatus : task.status) === "today" ? "today" : "backlog";
}

function updateBoard(nextBoard) {
  if (!nextBoard || !Array.isArray(nextBoard.tasks) || !Array.isArray(nextBoard.projects)) throw new Error("Your task list couldn’t be read. Please try again.");
  board = nextBoard;
  render();
}

function showProjectSync(projectSync) {
  const failed = projectSync?.status === "error";
  $("project-sync-error-text").textContent = failed ? projectSync.error || "Couldn’t refresh your Codex projects. Your saved tasks and projects are still available." : "";
  $("project-sync-error").hidden = !failed;
}

async function mutate(name, args) {
  const result = await callTool(name, args);
  if (!result?.board) throw new Error(result?.error || "The change couldn’t be saved. Please try again.");
  updateBoard(result.board);
  return result;
}

function fillProjectSelect(select, includeFilter = false) {
  const previous = select.value;
  const options = includeFilter ? [["All projects", "all"], ["No project", "none"]] : [["No project", ""]];
  if (select.id === "capture-project") options.unshift(["No project", "__unresolved__"]);
  options.push(...board.projects.map((project) => [project.name, project.id]));
  const unchanged = select.options.length === options.length && options.every(([label, value], index) => select.options[index].value === value && select.options[index].textContent === label);
  if (unchanged) return;
  select.replaceChildren(...options.map(([label, value]) => {
    const option = new Option(label, value);
    if (value === "__unresolved__") { option.hidden = true; option.disabled = true; }
    return option;
  }));
  select.value = options.some(([, value]) => value === previous) ? previous : includeFilter ? "all" : "";
}

function setReady(value) {
  if (ready === value) return;
  ready = value;
  for (const id of ["capture-title", "capture-project", "capture-status", "task-search", "project-filter"]) $(id).disabled = !value;
  renderCaptureState();
}

function captureInfo() {
  const text = $("capture-title").value;
  const defaultStatus = captureDefaultStatus;
  if (captureManualProjectId && !board.projects.some((project) => project.id === captureManualProjectId)) captureManualProjectId = null;
  if (confirmedProject && !board.projects.some((project) => project.id === confirmedProject.projectId)) confirmedProject = null;
  const initial = parseCapture(text, board.projects, { defaultStatus, projectId: null });
  if (!initial.projectMatch) {
    confirmedProject = null;
    return parseCapture(text, board.projects, { defaultStatus, projectId: captureManualProjectId });
  }
  if (confirmedProject?.query !== initial.projectMatch.query) confirmedProject = null;
  return parseCapture(text, board.projects, { defaultStatus, projectId: confirmedProject?.projectId || null });
}

function resizeCapture() {
  const input = $("capture-title");
  const scrollTop = input.scrollTop;
  const scrollLeft = input.scrollLeft;
  input.style.height = "auto";
  input.style.height = `${Math.min(260, input.scrollHeight)}px`;
  input.scrollTop = scrollTop;
  input.scrollLeft = scrollLeft;
  syncCaptureMirror();
}

function syncCaptureMirror() {
  const input = $("capture-title");
  const width = input.getBoundingClientRect().width - (input.offsetWidth - input.clientWidth);
  $("capture-highlight").style.inlineSize = `${Math.max(0, width)}px`;
  $("capture-backdrop").scrollTop = input.scrollTop;
  $("capture-backdrop").scrollLeft = input.scrollLeft;
}

function renderCaptureHighlight(parsed) {
  const text = $("capture-title").value;
  const match = parsed.projectMatch;
  const range = match?.ranges?.[0];
  const start = range?.start ?? -1;
  const end = range?.end ?? -1;
  const exact = match?.kind === "exact" && match.resolved && start >= 0 && text.slice(start, end) === match.tag;
  const nodes = [];
  if (exact) {
    nodes.push(document.createTextNode(text.slice(0, start)));
    nodes.push(element("span", "capture-tag", text.slice(start, end)));
    nodes.push(document.createTextNode(text.slice(end)));
  } else nodes.push(document.createTextNode(text));
  nodes.push(document.createTextNode("\u200b"));
  $("capture-highlight").replaceChildren(...nodes);
  $("capture-editor").classList.add("has-mirror");
  syncCaptureMirror();
}

function chooseCaptureProject(projectId) {
  const project = board.projects.find((entry) => entry.id === projectId);
  captureManualProjectId = project?.id || null;
  $("capture-title").value = setCaptureProject($("capture-title").value, project?.name || null, board.projects);
  confirmedProject = null;
  const initial = parseCapture($("capture-title").value, board.projects, { defaultStatus: captureDefaultStatus, projectId: null });
  if (project && initial.projectMatch) confirmedProject = { query: initial.projectMatch.query, projectId: project.id };
  resizeCapture();
  setError("capture-error", null);
  renderCaptureState();
}

function renderCaptureState() {
  const parsed = captureInfo();
  const match = parsed.projectMatch;
  const unresolved = Boolean(match && !match.resolved);
  $("capture-status").value = parsed.status;
  $("capture-project").value = unresolved ? "__unresolved__" : parsed.projectId || "";
  $("capture-submit").disabled = !ready || captureBusy || unresolved;
  renderCaptureHighlight(parsed);
  return parsed;
}

function focusToken() {
  return document.activeElement?.dataset?.focusKey || null;
}

function restoreRowFocus(token) {
  if (!token) return;
  const target = Array.from(document.querySelectorAll("[data-focus-key]")).find((node) => node.dataset.focusKey === token);
  if (target && !target.disabled) target.focus({ preventScroll: true });
  else $("task-panel").focus({ preventScroll: true });
}

function render() {
  const previousFocus = focusToken();
  for (const id of ["capture-project", "edit-project"]) fillProjectSelect($(id));
  fillProjectSelect($("project-filter"), true);
  renderCaptureState();
  const query = $("task-search").value.trim().toLocaleLowerCase();
  const projectFilter = $("project-filter").value;
  const filtered = Boolean(query || projectFilter !== "all");
  const projects = new Map(board.projects.map((project) => [project.id, project]));
  const matching = board.tasks.filter((task) => {
    if (task.status === "done" && !completingTasks.has(task.id)) return false;
    if (projectFilter === "none" && task.projectId) return false;
    if (projectFilter !== "all" && projectFilter !== "none" && task.projectId !== projectFilter) return false;
    const haystack = [ideaText(task), projects.get(task.projectId)?.name].filter(Boolean).join(" ").toLocaleLowerCase();
    return !query || haystack.includes(query);
  });
  for (const status of statuses) {
    const tasks = matching.filter((task) => taskSection(task) === status).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const list = $(`${status}-list`);
    const rows = tasks.map((task) => completingTasks.get(task.id)?.row || taskRow(task, projects.get(task.projectId)));
    const desired = new Set(rows);
    for (const child of Array.from(list.children)) if (!desired.has(child)) child.remove();
    rows.forEach((row, index) => { if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null); });
    $(`${status}-list`).hidden = !tasks.length;
    $(`${status}-count`).textContent = tasks.length;
    $(`${status}-count`).setAttribute("aria-label", `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`);
    $(`${status}-empty`).hidden = false;
    $(`${status}-empty`).setAttribute("aria-hidden", String(tasks.length > 0));
    $(`${status}-empty-copy`).textContent = filtered ? "No matching tasks." : status === "today" ? "Nothing planned for today." : "Keep ideas here for when you’re ready.";
  }
  $("task-sections").hidden = !ready;
  restoreRowFocus(previousFocus);
}

function taskRow(task, project) {
  const row = element("li", `task-row${task.status === "done" ? " is-done" : ""}`);
  row.dataset.taskId = task.id;
  const label = taskLabel(task);
  const checkbox = element("input", "task-checkbox");
  checkbox.type = "checkbox";
  checkbox.checked = task.status === "done";
  checkbox.disabled = busyTasks.has(task.id);
  checkbox.dataset.focusKey = `check-${task.id}`;
  checkbox.setAttribute("aria-label", `${task.status === "done" ? "Restore" : "Complete"} ${label}`);
  checkbox.addEventListener("change", () => toggleTask(task, row));
  const content = element("div", "task-content");
  content.append(element("p", "task-title", ideaText(task)));
  const meta = element("div", "task-meta");
  if (project) {
    const chip = element("span", "project-chip");
    chip.title = project.path;
    chip.append(icon("folder"), element("span", "", project.name));
    meta.append(chip);
  }
  const openButton = element("button", "open-codex", "Open in Codex");
  openButton.type = "button";
  openButton.append(icon("arrow"));
  openButton.dataset.focusKey = `open-${task.id}`;
  openButton.setAttribute("aria-label", `Open ${label} in Codex`);
  openButton.disabled = busyTasks.has(task.id);
  openButton.addEventListener("click", () => launchTask(task, project, openButton));
  meta.append(openButton);
  content.append(meta);
  const edit = element("button", "icon-button task-edit");
  edit.type = "button";
  edit.setAttribute("aria-label", `Edit ${label}`);
  edit.title = "Edit task";
  edit.dataset.focusKey = `edit-${task.id}`;
  edit.disabled = busyTasks.has(task.id);
  edit.append(icon("edit"));
  edit.addEventListener("click", () => showTaskEditor(task));
  row.append(checkbox, content, edit);
  if (rowErrors.has(task.id)) {
    const error = element("p", "field-error row-error", rowErrors.get(task.id));
    error.setAttribute("role", "alert");
    row.append(error);
  }
  return row;
}

async function toggleTask(task, row) {
  const checkbox = row.querySelector(".task-checkbox");
  checkbox.checked = true;
  if (busyTasks.has(task.id)) return;
  busyTasks.add(task.id);
  rowErrors.delete(task.id);
  row.querySelector(".row-error")?.remove();
  checkbox.setAttribute("aria-disabled", "true");
  for (const button of row.querySelectorAll("button")) button.disabled = true;
  const animation = startTaskCompletion(row);
  completingTasks.set(task.id, { row, animation });
  let completed = false;
  try {
    await Promise.all([
      mutate("todo_update", { id: task.id, status: "done", previousStatus: taskSection(task) }),
      animation.finished
    ]);
    if (board.tasks.find(entry => entry.id === task.id)?.status !== "done") return;
    await animation.collapse();
    completed = board.tasks.find(entry => entry.id === task.id)?.status === "done";
    if (!completed) return;
    showToast("Task completed.", {
      label: "Undo",
      focusKey: `check-${task.id}`,
      run: () => mutate("todo_update", { id: task.id, status: taskSection(task) })
    });
  } catch (error) { rowErrors.set(task.id, errorMessage(error)); }
  finally {
    let nextFocus;
    if (completed && row.contains(document.activeElement)) {
      const checkboxes = Array.from(document.querySelectorAll(".task-checkbox"));
      const index = checkboxes.indexOf(checkbox);
      const available = node => node !== checkbox && !node.disabled && node.getAttribute("aria-disabled") !== "true";
      nextFocus = checkboxes.slice(index + 1).find(available)?.dataset.focusKey || checkboxes.slice(0, index).reverse().find(available)?.dataset.focusKey || "panel";
    }
    animation.cancel();
    completingTasks.delete(task.id);
    busyTasks.delete(task.id);
    render();
    if (nextFocus) restoreRowFocus(nextFocus);
  }
}

async function launchTask(task, project, button) {
  busyTasks.add(task.id);
  rowErrors.delete(task.id);
  button.disabled = true;
  button.replaceChildren(document.createTextNode("Opening…"));
  try {
    const result = await openCodex(task, project);
    if (!result?.fallback) showToast("Chat draft requested. Press Send in Codex to begin.");
  } catch (error) { rowErrors.set(task.id, errorMessage(error)); }
  finally { busyTasks.delete(task.id); render(); }
}

function showTaskEditor(task) {
  editingTaskId = task.id;
  $("edit-title").value = ideaText(task);
  $("edit-project").value = task.projectId || "";
  $("edit-status").value = taskSection(task);
  setError("edit-error", null);
  $("task-dialog").showModal();
  $("edit-title").focus();
}

function showConfirmation(task) {
  confirmation = task.id;
  $("confirm-copy").textContent = `“${taskLabel(task)}” will be permanently removed from your list.`;
  setError("confirm-error", null);
  $("confirm-dialog").showModal();
  $("confirm-cancel").focus();
}

function stopToastTimer() {
  clearTimeout(toastTimer);
  if (toastStartedAt) toastRemaining = Math.max(0, toastRemaining - (Date.now() - toastStartedAt));
  toastStartedAt = 0;
}

function resumeToastTimer() {
  if ($("toast").hidden || document.hidden) return;
  clearTimeout(toastTimer);
  toastStartedAt = Date.now();
  toastTimer = setTimeout(() => { $("toast").hidden = true; toastStartedAt = 0; }, toastRemaining);
}

function showToast(message, action = null) {
  clearTimeout(toastTimer);
  toastAction = action;
  $("toast-copy").textContent = message;
  $("toast-undo").hidden = !action;
  $("toast-undo").textContent = action?.label || "Undo";
  $("toast-undo").disabled = false;
  $("toast").hidden = false;
  toastRemaining = 5500;
  toastStartedAt = 0;
  resumeToastTimer();
}

$("toast-undo").addEventListener("click", async () => {
  const action = toastAction;
  if (!action || $("toast-undo").disabled) return;
  const ownedFocus = document.activeElement === $("toast-undo");
  stopToastTimer();
  $("toast-undo").disabled = true;
  try {
    await action.run();
    if (toastAction === action) {
      const restoreFocus = ownedFocus && (document.activeElement === $("toast-undo") || document.activeElement === document.body);
      showToast("Task restored.");
      if (restoreFocus) restoreRowFocus(action.focusKey);
    }
  } catch (error) {
    if (toastAction === action) {
      $("toast-copy").textContent = errorMessage(error);
      $("toast-undo").disabled = false;
      if (ownedFocus && document.activeElement === document.body) $("toast-undo").focus({ preventScroll: true });
      toastRemaining = 5500;
      resumeToastTimer();
    }
  }
});

async function loadBoard(force = false) {
  if (loading) return;
  loading = true;
  $("retry-button").disabled = true;
  $("task-panel").setAttribute("aria-busy", "true");
  if (!ready) $("loading-state").hidden = false;
  $("board-error").hidden = true;
  try {
    let nextBoard = await initialize();
    if (force) {
      const refreshed = await callTool("todo_list", { refreshProjects: true });
      nextBoard = refreshed.board;
      showProjectSync(refreshed.projectSync);
    }
    setReady(true);
    updateBoard(nextBoard);
  } catch (error) {
    $("board-error-text").textContent = errorMessage(error);
    $("board-error").hidden = false;
  } finally {
    loading = false;
    $("retry-button").disabled = false;
    $("loading-state").hidden = true;
    $("task-panel").setAttribute("aria-busy", "false");
  }
}

$("capture-title").addEventListener("input", () => {
  resizeCapture();
  setError("capture-error", null);
  renderCaptureState();
});
$("capture-title").addEventListener("scroll", syncCaptureMirror, { passive: true });
$("capture-title").addEventListener("compositionend", () => { resizeCapture(); renderCaptureState(); });
let captureObservedWidth = null;
const captureResizeObserver = new ResizeObserver(([entry]) => {
  if (captureObservedWidth !== entry.contentRect.width) {
    captureObservedWidth = entry.contentRect.width;
    resizeCapture();
  } else syncCaptureMirror();
});
captureResizeObserver.observe($("capture-title"));
$("capture-project").addEventListener("change", () => chooseCaptureProject($("capture-project").value));
$("capture-status").addEventListener("change", () => {
  captureDefaultStatus = $("capture-status").value;
  $("capture-title").value = setCaptureStatus($("capture-title").value, captureDefaultStatus);
  resizeCapture();
  setError("capture-error", null);
  renderCaptureState();
});
$("capture-title").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  const parsed = renderCaptureState();
  if (parsed.projectMatch && !parsed.projectMatch.resolved) {
    $("capture-project").focus();
  } else if (!captureBusy) $("capture-form").requestSubmit();
});

$("capture-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (captureBusy) return;
  const text = $("capture-title").value.trim();
  if (!text) { setError("capture-error", "Write an idea to add."); $("capture-title").focus(); return; }
  const parsed = renderCaptureState();
  if (parsed.projectMatch && !parsed.projectMatch.resolved) { $("capture-project").focus(); return; }
  if (!parsed.title?.trim()) { setError("capture-error", "Add an idea alongside the shortcut."); $("capture-title").focus(); return; }
  const args = { text, status: parsed.status, projectId: parsed.projectId || null };
  captureBusy = true;
  for (const node of $("capture-form").elements) node.disabled = true;
  $("capture-submit").textContent = "Saving…";
  setError("capture-error", null);
  try {
    await mutate("todo_capture", args);
    $("capture-title").value = "";
    $("capture-title").style.height = "";
    captureManualProjectId = null;
    confirmedProject = null;
    $("task-search").value = "";
    $("project-filter").value = "all";
    render();
    showToast(`Added to ${statusNames[parsed.status]}.`);
  } catch (error) { setError("capture-error", error); }
  finally {
    captureBusy = false;
    for (const node of $("capture-form").elements) node.disabled = false;
    $("capture-submit").textContent = "Add task";
    renderCaptureState();
    $("capture-title").focus();
  }
});

$("task-search").addEventListener("input", render);
$("project-filter").addEventListener("change", render);
$("retry-button").addEventListener("click", () => loadBoard(true));
for (const button of document.querySelectorAll("[data-close-dialog]")) button.addEventListener("click", () => $(button.dataset.closeDialog).close());
for (const dialog of document.querySelectorAll("dialog")) dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
    if (!dialog.querySelector("button[type='submit']:disabled, #confirm-submit:disabled")) dialog.close();
  }
});

$("edit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if ($("edit-save").disabled) return;
  const title = $("edit-title").value.trim();
  if (!title) { setError("edit-error", "Write an idea to save."); $("edit-title").focus(); return; }
  const task = board.tasks.find((entry) => entry.id === editingTaskId);
  if (!task) { setError("edit-error", "This task is no longer in your list."); return; }
  const section = $("edit-status").value;
  const args = { id: editingTaskId, title, notes: "", projectId: $("edit-project").value || null, status: task.status === "done" ? "done" : section, previousStatus: section };
  $("edit-save").disabled = true;
  $("delete-task").disabled = true;
  $("edit-save").textContent = "Saving…";
  setError("edit-error", null);
  try { await mutate("todo_update", args); $("task-dialog").close(); showToast("Task updated."); }
  catch (error) { setError("edit-error", error); }
  finally { $("edit-save").disabled = false; $("delete-task").disabled = false; $("edit-save").textContent = "Save changes"; if ($("task-dialog").open) $("edit-save").focus(); }
});

$("delete-task").addEventListener("click", () => {
  const task = board.tasks.find((entry) => entry.id === editingTaskId);
  if (task) showConfirmation(task);
  else setError("edit-error", "This task is no longer in your list.");
});
$("confirm-cancel").addEventListener("click", () => $("confirm-dialog").close());
$("confirm-submit").addEventListener("click", async () => {
  if (!confirmation || $("confirm-submit").disabled) return;
  $("confirm-submit").disabled = true;
  $("confirm-cancel").disabled = true;
  $("confirm-submit").textContent = "Deleting…";
  setError("confirm-error", null);
  try { await mutate("todo_delete", { id: confirmation }); $("task-dialog").close(); $("confirm-dialog").close(); showToast("Task deleted."); }
  catch (error) { setError("confirm-error", error); }
  finally { $("confirm-submit").disabled = false; $("confirm-cancel").disabled = false; $("confirm-submit").textContent = "Delete task"; }
});
$("confirm-dialog").addEventListener("cancel", (event) => { if ($("confirm-submit").disabled) event.preventDefault(); });
$("task-dialog").addEventListener("cancel", (event) => { if ($("edit-save").disabled) event.preventDefault(); });
$("task-dialog").addEventListener("close", () => {
  requestAnimationFrame(() => { if (!document.querySelector("dialog[open]")) restoreRowFocus(`edit-${editingTaskId}`); });
});
$("confirm-dialog").addEventListener("close", () => {
  requestAnimationFrame(() => { if (!document.querySelector("dialog[open]") && !document.activeElement?.closest(".task-row")) $("task-panel").focus({ preventScroll: true }); });
});
$("toast-dismiss").addEventListener("click", () => { clearTimeout(toastTimer); $("toast").hidden = true; });
$("toast").addEventListener("pointerenter", stopToastTimer);
$("toast").addEventListener("pointerleave", resumeToastTimer);
$("toast").addEventListener("focusin", stopToastTimer);
$("toast").addEventListener("focusout", resumeToastTimer);
document.addEventListener("visibilitychange", () => document.hidden ? stopToastTimer() : resumeToastTimer());
$("project-sync-retry").addEventListener("click", async () => {
  const button = $("project-sync-retry");
  const restoreCaptureFocus = document.activeElement === button;
  button.disabled = true;
  button.textContent = "Retrying…";
  try {
    const result = await callTool("todo_list", { refreshProjects: true });
    updateBoard(result.board);
    showProjectSync(result.projectSync);
    if (result.projectSync?.status === "ready" && restoreCaptureFocus && (document.activeElement === button || document.activeElement === document.body)) $("capture-title").focus();
  } catch (error) {
    $("project-sync-error-text").textContent = errorMessage(error);
    $("project-sync-error").hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Retry";
  }
});
subscribe((nextBoard, projectSync) => {
  try { setReady(true); if (nextBoard !== board) updateBoard(nextBoard); showProjectSync(projectSync); }
  catch (error) { $("board-error-text").textContent = errorMessage(error); $("board-error").hidden = false; }
});
loadBoard();
