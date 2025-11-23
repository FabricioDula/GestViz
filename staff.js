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

// Página de Unidades (para crear ahí un bloque detallado de personal)
const unidadesPage = document.querySelector(".page-unidades");

// Referencias que inicializaremos cuando creemos el UI
let staffForm = null;
let staffNameInput = null;
let staffPhoneInput = null;
let staffSalaryInput = null;
let staffNotesInput = null;
let staffList = null;

// Lista de personal detallada en la pestaña "Unidades"
let unitsStaffList = null;

// ===== UTILIDAD PARA HABILITAR / DESHABILITAR FORM =====
function setStaffFormEnabled(enabled) {
  if (!staffForm) return;
  const elements = staffForm.querySelectorAll("input, button, textarea");
  elements.forEach((el) => {
    el.disabled = !enabled;
  });
}

// ===== CREAR INTERFAZ DEL MÓDULO DE PERSONAL (sección en Inmuebles) =====
function initStaffUI() {
  if (!staffModuleRoot) return;

  staffModuleRoot.innerHTML = `
    <div class="staff-card">
      <h3>Registrar personal del inmueble</h3>
      <p class="hint">
        El personal se asocia al inmueble seleccionado. Primero selecciona un inmueble en la pestaña "Inmuebles".
      </p>

      <form id="staff-form">
        <label>
          Nombre del personal:
          <input
            type="text"
            id="staff-name"
            placeholder="Ej: Juan Pérez"
            required
          />
        </label>

        <label>
          Teléfono:
          <input
            type="text"
            id="staff-phone"
            placeholder="Opcional"
          />
        </label>

        <label>
          Sueldo / paga mensual:
          <input
            type="number"
            step="0.01"
            min="0"
            id="staff-salary"
            placeholder="0.00"
          />
        </label>

        <label style="flex: 1 1 100%;">
          Notas:
          <textarea
            id="staff-notes"
            rows="2"
            placeholder="Rol, turno, funciones, etc."
          ></textarea>
        </label>

        <button type="submit" class="btn btn-primary">
          <span class="material-symbols-outlined">group_add</span>
          <span class="btn-label">Agregar personal</span>
        </button>
      </form>
    </div>

    <div class="staff-card">
      <h3>Personal registrado en el inmueble</h3>
      <ul id="staff-list" class="list"></ul>
    </div>
  `;

  // Asignamos referencias
  staffForm = document.getElementById("staff-form");
  staffNameInput = document.getElementById("staff-name");
  staffPhoneInput = document.getElementById("staff-phone");
  staffSalaryInput = document.getElementById("staff-salary");
  staffNotesInput = document.getElementById("staff-notes");
  staffList = document.getElementById("staff-list");

  // Inicio deshabilitado hasta que haya inmueble
  setStaffFormEnabled(false);

  if (staffForm) {
    staffForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const buildingId = currentBuildingHidden?.value || "";
      const buildingNombre = staffBuildingLabel?.textContent || "";

      if (!buildingId) {
        alert("Primero selecciona un inmueble para registrar personal.");
        return;
      }

      const nombre = staffNameInput.value.trim();
      const telefono = staffPhoneInput.value.trim();
      const notas = staffNotesInput.value.trim();
      const sueldoRaw = staffSalaryInput.value.trim();
      const sueldo = sueldoRaw ? parseFloat(sueldoRaw) : 0;

      if (!nombre) {
        alert("El nombre del personal es obligatorio.");
        return;
      }

      await addDoc(collection(db, "staff"), {
        buildingId,
        buildingNombre,
        nombre,
        telefono,
        sueldo,
        notas,
        activo: true,
        creadoEn: new Date()
      });

      staffNameInput.value = "";
      staffPhoneInput.value = "";
      staffSalaryInput.value = "";
      staffNotesInput.value = "";

      await cargarPersonalEdificio(buildingId);
    });
  }
}

// ===== CREAR BLOQUE DETALLADO EN PESTAÑA "UNIDADES" =====
function initUnitsStaffBlock() {
  if (!unidadesPage) return;

  const existingSection = document.getElementById("units-staff-section");
  if (existingSection) {
    unitsStaffList = existingSection.querySelector("#units-staff-list");
    return;
  }

  const section = document.createElement("section");
  section.id = "units-staff-section";
  section.innerHTML = `
    <h2>Personal del inmueble</h2>
    <p class="hint">
      Listado del personal asociado al inmueble seleccionado. Solo lectura.
    </p>
    <ul id="units-staff-list" class="list"></ul>
  `;
  unidadesPage.appendChild(section);

  unitsStaffList = section.querySelector("#units-staff-list");
}

// ===== CARGAR PERSONAL POR EDIFICIO =====
async function cargarPersonalEdificio(buildingId) {
  if (!staffList) return;

  staffList.innerHTML = "";
  if (unitsStaffList) {
    unitsStaffList.innerHTML = "";
  }

  if (!buildingId) {
    const li = document.createElement("li");
    li.textContent = "Primero selecciona un inmueble.";
    staffList.appendChild(li);

    if (unitsStaffList) {
      const li2 = document.createElement("li");
      li2.textContent = "Primero selecciona un inmueble.";
      unitsStaffList.appendChild(li2);
    }

    if (summaryStaffCount) summaryStaffCount.textContent = "—";
    if (unitsSummaryStaff) unitsSummaryStaff.textContent = "—";
    if (summaryStaffNames) summaryStaffNames.textContent = "—";

    setStaffFormEnabled(false);
    return;
  }

  setStaffFormEnabled(true);

  const q = query(
    collection(db, "staff"),
    where("buildingId", "==", buildingId)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    const li = document.createElement("li");
    li.textContent = "No hay personal registrado para este inmueble.";
    staffList.appendChild(li);

    if (unitsStaffList) {
      const li2 = document.createElement("li");
      li2.textContent = "No hay personal registrado para este inmueble.";
      unitsStaffList.appendChild(li2);
    }

    if (summaryStaffCount) summaryStaffCount.textContent = "0 personas";
    if (unitsSummaryStaff) unitsSummaryStaff.textContent = "Sin personal registrado";
    if (summaryStaffNames) summaryStaffNames.textContent = "Sin personal registrado";
    return;
  }

  let total = 0;
  const nombresActivos = [];

  snapshot.forEach((docSnap) => {
    total += 1;
    const data = docSnap.data();
    const id = docSnap.id;

    const estadoTexto = data.activo ? "ACTIVO" : "INACTIVO";
    const sueldo = Number(data.sueldo || 0);

    // ===== LISTA PRINCIPAL (MÓDULO STAFF EN INMUEBLES) =====
    const li = document.createElement("li");
    const spanInfo = document.createElement("span");
    spanInfo.textContent =
      `${data.nombre} - Tel: ${data.telefono || "N/A"} - Sueldo: ${sueldo.toFixed(2)} - Estado: ${estadoTexto}` +
      (data.notas ? ` - Notas: ${data.notas}` : "");
    li.appendChild(spanInfo);

    if (data.activo) {
      nombresActivos.push(data.nombre);
    }

    // Botón activar/desactivar
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn btn-xs " + (data.activo ? "btn-warning" : "btn-success");
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
    li.appendChild(toggleBtn);

    // Botón editar
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-xs btn-info";
    editBtn.innerHTML = `
      <span class="material-symbols-outlined">edit</span>
      <span class="btn-label">Editar</span>
    `;
    editBtn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const nuevoNombre = prompt("Nombre del personal:", data.nombre || "");
      if (nuevoNombre === null) return;
      const nombreTrim = nuevoNombre.trim();
      if (!nombreTrim) {
        alert("El nombre no puede quedar vacío.");
        return;
      }

      const nuevoTel = prompt("Teléfono:", data.telefono || "");
      if (nuevoTel === null) return;
      const telTrim = nuevoTel.trim();

      const nuevoSueldoStr = prompt(
        "Sueldo / paga mensual:",
        data.sueldo != null ? String(data.sueldo) : ""
      );
      if (nuevoSueldoStr === null) return;
      const sueldoNum = nuevoSueldoStr.trim() ? parseFloat(nuevoSueldoStr) : 0;

      const nuevasNotas = prompt("Notas:", data.notas || "");
      if (nuevasNotas === null) return;
      const notasTrim = nuevasNotas.trim();

      const staffRef = doc(db, "staff", id);
      await updateDoc(staffRef, {
        nombre: nombreTrim,
        telefono: telTrim,
        sueldo: sueldoNum,
        notas: notasTrim
      });

      await cargarPersonalEdificio(buildingId);
    });
    li.appendChild(editBtn);

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
      const ok = confirm(`¿Eliminar a ${data.nombre}?`);
      if (!ok) return;
      const staffRef = doc(db, "staff", id);
      await deleteDoc(staffRef);
      await cargarPersonalEdificio(buildingId);
    });
    li.appendChild(deleteBtn);

    staffList.appendChild(li);

    // ===== LISTA DETALLADA EN PESTAÑA UNIDADES =====
    if (unitsStaffList) {
      const liU = document.createElement("li");
      const spanU = document.createElement("span");
      spanU.textContent =
        `${data.nombre} - Tel: ${data.telefono || "N/A"} - Sueldo: ${sueldo.toFixed(2)} - Estado: ${estadoTexto}` +
        (data.notas ? ` - Notas: ${data.notas}` : "");
      liU.appendChild(spanU);
      unitsStaffList.appendChild(liU);
    }
  });

  // ===== Actualizar resúmenes =====
  if (summaryStaffCount) {
    summaryStaffCount.textContent =
      total === 1 ? "1 persona" : `${total} personas`;
  }

  if (nombresActivos.length === 0) {
    if (unitsSummaryStaff) unitsSummaryStaff.textContent = "Sin personal activo";
    if (summaryStaffNames) {
      summaryStaffNames.textContent =
        total === 1
          ? "1 persona registrada (ninguna activa)"
          : `${total} personas registradas (ninguna activa)`;
    }
  } else {
    const primeros = nombresActivos.slice(0, 3).join(", ");
    const extra =
      nombresActivos.length > 3 ? ` y ${nombresActivos.length - 3} más` : "";

    const textoUnidades =
      nombresActivos.length === 1
        ? `1 activo: ${primeros}`
        : `${nombresActivos.length} activos: ${primeros}${extra}`;

    if (unitsSummaryStaff) unitsSummaryStaff.textContent = textoUnidades;

    if (summaryStaffNames) {
      const todos = nombresActivos.join(", ");
      summaryStaffNames.textContent =
        total === nombresActivos.length
          ? `${total} activos: ${todos}`
          : `${total} registrados, activos: ${todos}`;
    }
  }
}

// ===== ESCUCHAR CAMBIOS DESDE app.js (edificio / unidad) =====
if (currentBuildingHidden) {
  currentBuildingHidden.addEventListener("change", () => {
    const buildingId = currentBuildingHidden.value || "";
    if (!buildingId) {
      if (staffBuildingLabel) staffBuildingLabel.textContent = "Ninguno";
      cargarPersonalEdificio("");
      return;
    }
    cargarPersonalEdificio(buildingId);
  });
}

if (currentUnitHidden && staffUnitLabel) {
  currentUnitHidden.addEventListener("change", () => {
    const unitId = currentUnitHidden.value || "";
    if (!unitId) {
      staffUnitLabel.textContent = "Ninguna";
      return;
    }
    // El nombre de la unidad lo setea app.js en staff-unit-label
  });
}

// ===== INICIALIZAR MÓDULO =====
initStaffUI();
initUnitsStaffBlock();

// Si al cargar ya hay un edificio seleccionado
if (currentBuildingHidden && currentBuildingHidden.value) {
  cargarPersonalEdificio(currentBuildingHidden.value);
}
