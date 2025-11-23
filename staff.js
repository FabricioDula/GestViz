import { getApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Reutilizamos la misma app Firebase inicializada en app.js
const app = getApp();
const db = getFirestore(app);

// ----- DOM principal para el módulo de personal -----
const staffModuleRoot = document.getElementById("staff-module-root");
const currentBuildingHidden = document.getElementById("current-building-id");
const currentUnitHidden = document.getElementById("current-unit-id");
const staffBuildingLabel = document.getElementById("staff-building-label");
const staffUnitLabel = document.getElementById("staff-unit-label");

// Resúmenes en otras pestañas
const summaryStaffCount = document.getElementById("summary-staff-count");
const summaryStaffNames = document.getElementById("summary-staff-names");
const unitsSummaryStaff = document.getElementById("units-summary-staff");

// Página de Unidades (para crear ahí un bloque detallado de personal si queremos)
const unidadesPage = document.querySelector(".page-unidades");

// ----- Modal de personal -----
const staffModal = document.getElementById("staff-modal");
const staffModalForm = document.getElementById("staff-modal-form");
const staffModalIdInput = document.getElementById("staff-modal-id");
const staffModalNameInput = document.getElementById("staff-modal-name");
const staffModalPhoneInput = document.getElementById("staff-modal-phone");
const staffModalSalaryInput = document.getElementById("staff-modal-salary");
const staffModalNotesInput = document.getElementById("staff-modal-notes");
const staffModalActiveSelect = document.getElementById("staff-modal-active");
const staffModalBuildingNameLabel = document.getElementById("staff-modal-building-name");
const staffModalCloseBtn = document.getElementById("staff-modal-close");
const staffModalCancelBtn = document.getElementById("staff-modal-cancel");

// Referencias que inicializaremos cuando creemos el UI de lista
let staffList = null;        // lista en la pestaña Inmuebles (debajo del grid)
let unitsStaffList = null;   // lista de solo lectura en Unidades (opcional)

// =======================================================
//  Utilidades de resumen de personal
// =======================================================
function actualizarResumenStaff(total, nombresActivos) {
  if (!Array.isArray(nombresActivos)) nombresActivos = [];

  // Conteo simple
  if (summaryStaffCount) {
    summaryStaffCount.textContent = String(total ?? 0);
  }

  // Texto resumen para la pestaña Inmuebles
  if (summaryStaffNames) {
    if (total === 0) {
      summaryStaffNames.textContent = "Sin personal registrado";
    } else if (nombresActivos.length === 0) {
      summaryStaffNames.textContent =
        total === 1
          ? "1 persona registrada (ninguna activa)"
          : `${total} personas registradas (ninguna activa)`;
    } else {
      const todos = nombresActivos.join(", ");
      if (total === nombresActivos.length) {
        summaryStaffNames.textContent = `${total} activos: ${todos}`;
      } else {
        summaryStaffNames.textContent = `${total} registrados, activos: ${todos}`;
      }
    }
  }

  // Resumen para la tarjeta de Unidades
  if (unitsSummaryStaff) {
    if (total === 0) {
      unitsSummaryStaff.textContent = "Sin personal asignado";
    } else if (nombresActivos.length === 0) {
      unitsSummaryStaff.textContent =
        total === 1
          ? "1 persona registrada (ninguna activa)"
          : `${total} personas registradas (ninguna activa)`;
    } else {
      const primeros = nombresActivos.slice(0, 3).join(", ");
      const extra =
        nombresActivos.length > 3 ? ` y ${nombresActivos.length - 3} más` : "";

      const texto =
        nombresActivos.length === 1
          ? `1 activo: ${primeros}`
          : `${nombresActivos.length} activos: ${primeros}${extra}`;

      unitsSummaryStaff.textContent = texto;
    }
  }
}

// =======================================================
//  UI principal en pestaña INMUEBLES
// =======================================================
function initStaffUI() {
  if (!staffModuleRoot) return;

  staffModuleRoot.innerHTML = `
    <div class="staff-card">
      <h3>Personal del inmueble</h3>
      <p class="hint">
        Aquí se muestra el personal asociado al inmueble seleccionado.
        Usa el botón <strong>"Nuevo"</strong> en el listado de inmuebles para registrar personal.
      </p>
      <ul id="staff-list" class="list"></ul>
    </div>
  `;

  staffList = staffModuleRoot.querySelector("#staff-list");
}

// =======================================================
//  Bloque adicional en pestaña UNIDADES (solo lectura)
// =======================================================
function initUnitsStaffBlock() {
  // Ahora el bloque viene ya creado en el HTML dentro del reporte
  const container = document.getElementById("units-staff-section");
  if (!container) return;

  unitsStaffList = container.querySelector("#units-staff-list");
}


// =======================================================
//  Cargar personal por inmueble
// =======================================================
async function cargarPersonalEdificio(buildingId) {
  // Sin inmueble → limpiar todo
  if (!buildingId) {
    if (staffList) staffList.innerHTML = "";
    if (unitsStaffList) unitsStaffList.innerHTML = "";
    actualizarResumenStaff(0, []);
    return;
  }

  // Limpiar listas
  if (staffList) staffList.innerHTML = "";
  if (unitsStaffList) unitsStaffList.innerHTML = "";

  const qStaff = query(
    collection(db, "staff"),
    where("buildingId", "==", buildingId)
  );
  const snapshot = await getDocs(qStaff);

  if (snapshot.empty) {
    if (staffList) {
      const li = document.createElement("li");
      li.textContent = "No hay personal registrado para este inmueble.";
      staffList.appendChild(li);
    }
    if (unitsStaffList) {
      const li2 = document.createElement("li");
      li2.textContent = "No hay personal registrado para este inmueble.";
      unitsStaffList.appendChild(li2);
    }
    actualizarResumenStaff(0, []);
    return;
  }

  const nombresActivos = [];
  let total = 0;

  snapshot.forEach((docSnap) => {
    total += 1;
    const data = docSnap.data();
    const id = docSnap.id;

    const estadoTexto = data.activo ? "ACTIVO" : "INACTIVO";
    const sueldo = Number(data.sueldo || 0);

    // ===== LISTA PRINCIPAL (Inmuebles) =====
    if (staffList) {
      const li = document.createElement("li");
      const main = document.createElement("div");
      main.className = "item-main";

      main.innerHTML = `
        <strong>${data.nombre || "Sin nombre"}</strong>
        <div style="font-size:0.8rem; color:#666;">
          Tel: ${data.telefono || "N/A"} · Sueldo: ${sueldo.toFixed(
        2
      )} · Estado: ${estadoTexto}
        </div>
        ${
          data.notas
            ? `<div style="font-size:0.75rem; color:#888; margin-top:0.2rem;">
                 ${data.notas}
               </div>`
            : ""
        }
      `;
      li.appendChild(main);

      const actions = document.createElement("div");

      // Botón activar/desactivar
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className =
        "btn btn-xs " + (data.activo ? "btn-warning" : "btn-success");
      toggleBtn.innerHTML = `
        <span class="material-symbols-outlined">
          ${data.activo ? "block" : "check_circle"}
        </span>
        <span class="btn-label">
          ${data.activo ? "Desactivar" : "Activar"}
        </span>
      `;
      toggleBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const staffRef = doc(db, "staff", id);
        await updateDoc(staffRef, { activo: !data.activo });
        await cargarPersonalEdificio(buildingId);
      });
      actions.appendChild(toggleBtn);

      // Botón editar
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-xs btn-info";
      editBtn.innerHTML = `
        <span class="material-symbols-outlined">edit</span>
        <span class="btn-label">Editar</span>
      `;
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirStaffModal({
          buildingId,
          buildingNombre: staffBuildingLabel?.textContent || "",
          staffId: id,
          data
        });
      });
      actions.appendChild(editBtn);

      // Botón eliminar
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-xs btn-danger";
      deleteBtn.innerHTML = `
        <span class="material-symbols-outlined">delete</span>
        <span class="btn-label">Eliminar</span>
      `;
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = confirm(
          `¿Eliminar a ${data.nombre || "este personal"} del registro?`
        );
        if (!ok) return;
        await deleteDoc(doc(db, "staff", id));
        await cargarPersonalEdificio(buildingId);
      });
      actions.appendChild(deleteBtn);

      li.appendChild(actions);
      staffList.appendChild(li);
    }

    // ===== LISTA EN UNIDADES (solo lectura) =====
    if (unitsStaffList) {
      const li2 = document.createElement("li");
      const texto =
        `${data.nombre} - Tel: ${data.telefono || "N/A"} - Sueldo: ${sueldo.toFixed(
          2
        )} - Estado: ${estadoTexto}` +
        (data.notas ? ` - Notas: ${data.notas}` : "");
      li2.textContent = texto;
      unitsStaffList.appendChild(li2);
    }

    if (data.activo) {
      nombresActivos.push(data.nombre || "Sin nombre");
    }
  });

  actualizarResumenStaff(total, nombresActivos);
}

// =======================================================
//  Modal de personal
// =======================================================
function abrirStaffModal(opciones = {}) {
  if (!staffModal || !staffModalForm) return;

  const { buildingId, buildingNombre, staffId, data } = opciones;

  // Si viene un buildingId desde el grid de inmuebles, lo usamos como contexto
  if (buildingId) {
    if (currentBuildingHidden) {
      currentBuildingHidden.value = buildingId;
      currentBuildingHidden.dispatchEvent(new Event("change"));
    }
    if (staffBuildingLabel) {
      staffBuildingLabel.textContent = buildingNombre || "Ninguno";
    }
  }

  // Setear título y campos
  staffModalIdInput.value = staffId || "";
  staffModalNameInput.value = data?.nombre || "";
  staffModalPhoneInput.value = data?.telefono || "";
  staffModalSalaryInput.value =
    data?.sueldo != null ? String(data.sueldo) : "";
  staffModalNotesInput.value = data?.notas || "";
  staffModalActiveSelect.value =
    data?.activo === false ? "false" : "true";

  staffModalBuildingNameLabel.textContent =
    buildingNombre || staffBuildingLabel?.textContent || "Ninguno";

  staffModal.classList.add("visible");
}

function cerrarStaffModal() {
  if (!staffModal) return;
  staffModal.classList.remove("visible");
}

// Botones cerrar/cancelar modal
if (staffModalCloseBtn) {
  staffModalCloseBtn.addEventListener("click", cerrarStaffModal);
}
if (staffModalCancelBtn) {
  staffModalCancelBtn.addEventListener("click", cerrarStaffModal);
}

// Submit del modal
if (staffModalForm) {
  staffModalForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const buildingId = currentBuildingHidden?.value || "";
    const buildingNombre = staffBuildingLabel?.textContent || "";

    if (!buildingId) {
      alert("Primero selecciona un inmueble para registrar personal.");
      return;
    }

    const staffId = staffModalIdInput.value || null;
    const nombre = staffModalNameInput.value.trim();
    const telefono = staffModalPhoneInput.value.trim();
    const notas = staffModalNotesInput.value.trim();
    const sueldoRaw = staffModalSalaryInput.value.trim();
    const activo = staffModalActiveSelect.value === "true";

    if (!nombre) {
      alert("El nombre del personal es obligatorio.");
      return;
    }

    const sueldo =
      sueldoRaw !== "" && !isNaN(Number(sueldoRaw))
        ? Number(sueldoRaw)
        : 0;

    if (staffId) {
      // Actualizar
      const staffRef = doc(db, "staff", staffId);
      await updateDoc(staffRef, {
        nombre,
        telefono,
        notas,
        sueldo,
        activo
      });
    } else {
      // Crear
      await addDoc(collection(db, "staff"), {
        buildingId,
        buildingNombre,
        nombre,
        telefono,
        notas,
        sueldo,
        activo,
        creadoEn: new Date()
      });
    }

    cerrarStaffModal();
    await cargarPersonalEdificio(buildingId);
  });
}

// =======================================================
//  Sincronización con app.js
// =======================================================

// Cuando app.js cambia el inmueble actual
if (currentBuildingHidden) {
  currentBuildingHidden.addEventListener("change", () => {
    const buildingId = currentBuildingHidden.value || "";
    cargarPersonalEdificio(buildingId);
  });
}

// Cuando app.js cambia la unidad actual (para info en etiquetas)
if (currentUnitHidden) {
  currentUnitHidden.addEventListener("change", () => {
    const unitId = currentUnitHidden.value || "";
    if (!unitId) {
      if (staffUnitLabel) staffUnitLabel.textContent = "Ninguna";
      return;
    }
    // El nombre de la unidad lo setea app.js en staff-unit-label
  });
}

// Evento personalizado que dispara app.js cuando se pulsa "Nuevo" en el grid
window.addEventListener("openStaffModalForBuilding", (event) => {
  const detail = event.detail || {};
  const buildingId = detail.buildingId || "";
  const buildingNombre = detail.buildingNombre || "";

  if (!buildingId) {
    alert("No se encontró el inmueble para registrar personal.");
    return;
  }

  abrirStaffModal({ buildingId, buildingNombre });
});

// =======================================================
//  INIT
// =======================================================
function init() {
  initStaffUI();
  initUnitsStaffBlock();

  // Si al cargar ya hay un edificio seleccionado (app.js puede haberlo puesto)
  if (currentBuildingHidden && currentBuildingHidden.value) {
    cargarPersonalEdificio(currentBuildingHidden.value);
  }
}

init();
