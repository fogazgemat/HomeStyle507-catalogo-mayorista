// 1. Lista de vendedores
const VENDEDORES = [
    { nombre: "Francesco (Chorrera)", numero: "6236-4158" },
    { nombre: "Chris (Chorrera)", numero: "6977-8350" },
    { nombre: "Yoli", numero: "6168-3538" },
    { nombre: "Antoni", numero: "6260-6548" },
    { nombre: "Génesis", numero: "6171-3520" }
];

const DEFAULT_CONFIG = {
  vendedorFijo: null,
  numeroFijo: null
};

const PROFILE_CONFIG = {
  "chris (chorrera)": {
    vendedorFijo: "Chris (Chorrera)",
    numeroFijo: "6977-8350"
  },
  chris: {
    vendedorFijo: "Chris (Chorrera)",
    numeroFijo: "6977-8350"
  },
  yoli: {
    vendedorFijo: "Yoli",
    numeroFijo: "6168-3538"
  },
  antoni: {
    vendedorFijo: "Antoni",
    numeroFijo: "6260-6548"
  },
  fran: {
    vendedorFijo: "Francesco (Chorrera)",
    numeroFijo: "6236-4158"
  },
  "fran (chorrera)": {
    vendedorFijo: "Francesco (Chorrera)",
    numeroFijo: "6236-4158"
  },
  francesco: {
    vendedorFijo: "Francesco (Chorrera)",
    numeroFijo: "6236-4158"
  },
  genesis: {
    vendedorFijo: "Génesis",
    numeroFijo: "6171-3520"
  }
};

function normalizarPerfil(valor) {
  return (valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function palabrasBusqueda(valor) {
  return normalizarTextoBusqueda(valor)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function actualizarBotonUrlEspecial() {
  const button = document.getElementById("copySpecialSearchUrl");
  const input = document.getElementById("search");
  if (!button || !input) return;
  button.disabled = palabrasBusqueda(input.value).length === 0;
}

async function copiarUrlBusquedaEspecial() {
  const input = document.getElementById("search");
  const words = palabrasBusqueda(input ? input.value : "");
  if (!words.length) return;

  const url = new URL(window.location.href);
  url.searchParams.delete("modo");
  url.searchParams.set("grupo", words.join("-"));
  let copied = false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(url.toString());
      copied = true;
    } catch (error) {
      console.warn("No se pudo copiar la URL con el portapapeles moderno; se intentará el método alternativo.", error);
    }
  }
  if (!copied) {
    const temporaryInput = document.createElement("textarea");
    temporaryInput.value = url.toString();
    temporaryInput.setAttribute("readonly", "");
    temporaryInput.style.position = "fixed";
    temporaryInput.style.opacity = "0";
    document.body.appendChild(temporaryInput);
    temporaryInput.select();
    copied = document.execCommand("copy");
    temporaryInput.remove();
  }
  alert(copied ? "URL especial copiada." : "No se pudo copiar la URL especial.");
}

function obtenerConfigURL() {
  const params = new URLSearchParams(window.location.search);
  const perfilRaw = params.get("perfil") || params.get("trabajador") || params.get("vendedor") || "";
  const perfil = normalizarPerfil(perfilRaw);

  if (!perfil) {
    return {};
  }

  return PROFILE_CONFIG[perfil] || {};
}

const APP_CONFIG = {
  ...DEFAULT_CONFIG,
  ...obtenerConfigURL(),
  ...(window.CATALOGO_CONFIG || {})
};

let categoriaBaseActual = "Todos";

// 2. Variables de estado
let seleccion = JSON.parse(localStorage.getItem("seleccion")) || [];
let productoActual = null; // <--- ESTA ES LA QUE FALTABA
let intervaloCarruselesTarjetas = null;
let tiempoRestante = 5;
let intervaloTimer = null;
let mostrarPrecioMayor = false;
let grupoEspecialActivo = new URLSearchParams(window.location.search).get("grupo");
let toquesLogoMayor = [];
let modoDescargaImagenes = false;
let imagenesDescarga = [];
const seleccionImagenesDescarga = new Set();
const seleccionImagenesModal = new Set();
const PLACEHOLDER_BUSCADOR_NORMAL = "Buscar productos...";
const PLACEHOLDER_BUSCADOR_DESCARGA = "Buscar imágenes...";
const CLICKS_ACTIVACION_MAYOR = 7;
const VENTANA_ACTIVACION_MAYOR_MS = 5000;
const STORAGE_THEME_KEY = "catalogoTema";
const THEME_LIGHT = "claro";
const THEME_DARK = "nocturno";
const PRIORIDAD_RANK = {
  "Prioridad 1": 1,
  "Prioridad 2": 2,
  "Prioridad 3": 3
};
const GRID_COLUMN_CYCLE = [2, 1, 3];
const LABEL_REVIEW = "En proceso de revisión y finalización";
const LABEL_ALL_AVAILABLE = "Todas disponibles";
const LABEL_CONSULTAR = "Consultar disponibilidad";
const IMPUESTO_MAYORISTA = 0.07;

function normalizarPrioridad(valor) {
  const prioridad = (valor || "Prioridad 3").toString().trim();
  if (PRIORIDAD_RANK[prioridad]) return prioridad;
  if (prioridad.toLowerCase().includes("prioridad 1")) return "Prioridad 1";
  if (prioridad.toLowerCase().includes("prioridad 2")) return "Prioridad 2";
  return "Prioridad 3";
}

function obtenerPrioridadProducto(producto) {
  if (!producto) return "Prioridad 3";
  if (producto.dataset && producto.dataset.prioridad) return normalizarPrioridad(producto.dataset.prioridad);
  if (producto.priority_level) return normalizarPrioridad(producto.priority_level);
  if (producto.priority) return normalizarPrioridad(producto.priority);
  return "Prioridad 3";
}

function mezclarAleatoriamente(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function ordenarProductosPorPrioridad(productos) {
  const grupos = new Map();
  productos.forEach((producto) => {
    const nivel = obtenerPrioridadProducto(producto);
    if (!grupos.has(nivel)) grupos.set(nivel, []);
    grupos.get(nivel).push(producto);
  });

  const orden = [];
  Object.keys(PRIORIDAD_RANK)
    .sort((a, b) => PRIORIDAD_RANK[a] - PRIORIDAD_RANK[b])
    .forEach((nivel) => {
      const grupo = grupos.get(nivel) || [];
      mezclarAleatoriamente(grupo).forEach((producto) => orden.push(producto));
    });

  return orden;
}

function obtenerDisponibilidadProducto(producto) {
  if (!producto) return LABEL_CONSULTAR;
  const rawValue = producto.dataset?.todasDisponibles ?? producto.all_available ?? producto.todasDisponibles ?? false;
  const valor = String(rawValue).toLowerCase();
  return valor === "true" || valor === "1" || valor === "si" || valor === "yes" ? LABEL_ALL_AVAILABLE : LABEL_CONSULTAR;
}

function aplicarEtiquetasGlobales() {
  document.querySelectorAll(".card").forEach((card) => {
    const badge = card.querySelector(".badge-seguro-seguro") || document.createElement("span");
    badge.className = "badge-seguro-seguro";
    badge.textContent = LABEL_REVIEW;
    badge.setAttribute("aria-label", LABEL_REVIEW);
    if (!badge.parentElement) card.prepend(badge);

    const priorityValue = normalizarPrioridad(card.dataset.prioridad || "Prioridad 3");
    card.dataset.prioridad = priorityValue;
    const allAvailable = /^(true|1|si|yes)$/i.test(card.dataset.todasDisponibles || "false");
    card.dataset.todasDisponibles = String(allAvailable);
    card.querySelectorAll(".badge-todas-disponibles, .card-disponibilidad").forEach((item) => item.remove());
  });
}

function obtenerSeccionPrioridadUno() {
  const catalog = document.getElementById("catalogo");
  if (!catalog) return null;

  let section = document.getElementById("priorityOneSection");
  if (!section) {
    section = document.createElement("section");
    section.id = "priorityOneSection";
    section.className = "categoria";
    section.dataset.categoria = "Destacados";
    const title = document.createElement("h2");
    title.className = "category-title";
    title.textContent = "Prioridad 1";
    const grid = document.createElement("div");
    grid.className = "grid";
    grid.style.gridTemplateColumns = `repeat(${obtenerEstadoColumnasActual()}, minmax(0, 1fr))`;
    section.append(title, grid);
    catalog.prepend(section);
  }
  return section;
}

function aplicarOrdenPrioridadEnTarjetas() {
  const featuredSection = obtenerSeccionPrioridadUno();
  if (!featuredSection) return;
  const featuredGrid = featuredSection.querySelector(".grid");
  const cards = [...document.querySelectorAll("#catalogo .categoria:not(#priorityOneSection) .card, #priorityOneSection .card")];

  cards.forEach((card) => {
    if (!card.dataset.categoriaOriginal) {
      card.dataset.categoriaOriginal = card.closest(".categoria")?.dataset.categoria || "";
    }
  });

  const mostrarDestacadosGlobales = categoriaBaseActual === "Todos";
  cards.forEach((card) => {
    const section = [...document.querySelectorAll("#catalogo .categoria:not(#priorityOneSection)")]
      .find((item) => item.dataset.categoria === card.dataset.categoriaOriginal);
    const grid = section?.querySelector(".grid");
    if (mostrarDestacadosGlobales && obtenerPrioridadProducto(card) === "Prioridad 1") {
      featuredGrid.appendChild(card);
    } else if (grid) {
      grid.appendChild(card);
    }
  });

  const destacados = [...featuredGrid.querySelectorAll(".card")];
  ordenarProductosPorPrioridad(destacados).forEach((card) => featuredGrid.appendChild(card));
  featuredSection.style.display = mostrarDestacadosGlobales && destacados.length ? "" : "none";

  document.querySelectorAll("#catalogo .categoria:not(#priorityOneSection) .grid").forEach((grid) => {
    const categoryCards = [...grid.querySelectorAll(".card")];
    ordenarProductosPorPrioridad(categoryCards).forEach((card) => grid.appendChild(card));
  });
}

/* ================= FUNCIÓN GLOBAL: CERRAR MENÚ ================= */
function cerrarMenu() {
  const sideMenu = document.getElementById("sideMenu");
  const menuOverlay = document.getElementById("menuOverlay");
  const menuToggle = document.getElementById("menuToggle");
  
  if (sideMenu) sideMenu.classList.remove("active");
  if (menuOverlay) menuOverlay.classList.remove("active");
  document.body.style.overflow = "";
  if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
}

function aplicarTema(tema) {
  const esModoNocturno = tema === THEME_DARK;
  document.body.classList.toggle("modo-nocturno", esModoNocturno);

  const themeToggle = document.getElementById("themeToggle");
  const iconSun = document.querySelector(".theme-icon-sun");
  const iconMoon = document.querySelector(".theme-icon-moon");

  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(esModoNocturno));
    themeToggle.setAttribute(
      "aria-label",
      esModoNocturno ? "Cambiar a modo claro" : "Cambiar a modo nocturno"
    );
  }

  if (iconSun && iconMoon) {
    iconSun.style.display = esModoNocturno ? "none" : "block";
    iconMoon.style.display = esModoNocturno ? "block" : "none";
  }
}

function inicializarControlTema() {
  const themeToggle = document.getElementById("themeToggle");
  if (!themeToggle) return;

  const temaGuardado = localStorage.getItem(STORAGE_THEME_KEY);
  const temaInicial = temaGuardado === THEME_DARK ? THEME_DARK : THEME_LIGHT;
  aplicarTema(temaInicial);

  themeToggle.addEventListener("click", () => {
    const temaActual = document.body.classList.contains("modo-nocturno") ? THEME_DARK : THEME_LIGHT;
    const nuevoTema = temaActual === THEME_DARK ? THEME_LIGHT : THEME_DARK;
    localStorage.setItem(STORAGE_THEME_KEY, nuevoTema);
    aplicarTema(nuevoTema);
  });
}

/* ================= INICIALIZAR ================= */
document.addEventListener("DOMContentLoaded", () => {
  inicializarControlTema();
  aplicarConfiguracionUI();
  restaurarSeleccion();
  actualizarContador();
  actualizarBotonWA();
  cerrarModal(); 
  
  const revendedorAction = document.getElementById("modalRevendedorAction");
  if (revendedorAction) {
    revendedorAction.addEventListener("click", () => {
      const card = window.cardModalActual;
      if (!card) return;
      ejecutarAccionRevendedor(card);
    });
  }
  
  // Configurar event listeners para reemplazar inline handlers
  configurarEventListeners();
  
  aplicarEtiquetasGlobales();
  aplicarOrdenPrioridadEnTarjetas();

  // Iniciar carruseles en las cartas de productos
  iniciarCarruelesCartas();
  
  // Iniciar alternancia de eslogan
  iniciarAlternanciaEslogan();
  iniciarModoMayoristaDesdeLogo();
  
  // Aplicar filtrado de agotados al cargar la página
  filtrarCategoria("Todos", null);
  if (grupoEspecialActivo) {
    const searchInput = document.getElementById("search");
    if (searchInput) searchInput.value = grupoEspecialActivo.replace(/-/g, " ");
    filtrar();
  }
  actualizarBotonUrlEspecial();
  
  // Inicializar productos promocionales (mostrar precio)
  inicializarProductosPromocionales();
});

function aplicarConfiguracionUI() {
  if (!APP_CONFIG.numeroFijo && !APP_CONFIG.vendedorFijo) return;

  const enlacesWhatsApp = document.querySelectorAll('a[href*="wa.me/"]');
  enlacesWhatsApp.forEach(link => {
    if (APP_CONFIG.numeroFijo) {
      link.href = `https://wa.me/507${APP_CONFIG.numeroFijo.replace(/\D/g, "")}`;
    }
    if (APP_CONFIG.vendedorFijo) {
      link.setAttribute("aria-label", `WhatsApp ${APP_CONFIG.vendedorFijo}`);
    }
  });
}

function iniciarModoMayoristaDesdeLogo() {
  const logo = document.querySelector(".header-brand .logo-img");
  if (!logo) return;

  logo.style.cursor = "pointer";

  logo.addEventListener("click", (e) => {
    if (typeof e.button === "number" && e.button !== 0) return;
    registrarToqueLogoMayor();
  });
}

function obtenerEstadoColumnasActual() {
  const valorGuardado = localStorage.getItem("gridColumnsMode");
  if (valorGuardado && GRID_COLUMN_CYCLE.includes(Number(valorGuardado))) {
    return Number(valorGuardado);
  }
  return 2;
}

function avanzarCicloColumnas() {
  const actual = obtenerEstadoColumnasActual();
  const indexActual = GRID_COLUMN_CYCLE.indexOf(actual);
  const siguiente = GRID_COLUMN_CYCLE[(indexActual + 1) % GRID_COLUMN_CYCLE.length];
  localStorage.setItem("gridColumnsMode", String(siguiente));
  return siguiente;
}

function aplicarPreferenciaColumnasGrid() {
  const grids = document.querySelectorAll(".grid");
  const toggleText = document.getElementById("gridToggleText");
  const columnasActuales = obtenerEstadoColumnasActual();
  const siguiente = GRID_COLUMN_CYCLE[(GRID_COLUMN_CYCLE.indexOf(columnasActuales) + 1) % GRID_COLUMN_CYCLE.length];

  grids.forEach(grid => {
    grid.style.gridTemplateColumns = `repeat(${columnasActuales}, minmax(0, 1fr))`;
  });
  if (toggleText) toggleText.textContent = `Ver ${siguiente} ${siguiente === 1 ? "columna" : "columnas"}`;
}

function registrarToqueLogoMayor() {
  const ahora = Date.now();
  toquesLogoMayor.push(ahora);
  toquesLogoMayor = toquesLogoMayor.filter(ts => (ahora - ts) <= VENTANA_ACTIVACION_MAYOR_MS);

  if (toquesLogoMayor.length >= CLICKS_ACTIVACION_MAYOR) {
    toquesLogoMayor = [];
    alternarModoMayorista();
  }
}

function alternarModoMayorista() {
  mostrarPrecioMayor = !mostrarPrecioMayor;
  document.body.classList.toggle("modo-mayorista", mostrarPrecioMayor);

  const logo = document.querySelector(".header-brand .logo-img");
  if (logo) {
    logo.classList.toggle("logo-mayorista-activo", mostrarPrecioMayor);
  }

  if (window.cardModalActual) {
    actualizarPreciosModal(window.cardModalActual);
  }
}

function formatearPrecio(valor) {
  const numero = Number.parseFloat(String(valor).replace(/[^\d.]/g, "")) || 0;
  return `$${numero.toFixed(2)}`;
}

function formatearPrecioConImpuesto(valor) {
  const numero = Number.parseFloat(String(valor).replace(/[^\d.]/g, "")) || 0;
  return `$${(numero * (1 + IMPUESTO_MAYORISTA)).toFixed(2)}`;
}

function actualizarDisponibilidadModal(card) {
  const disponibilidadElem = document.getElementById("modalDisponibilidad");
  if (!disponibilidadElem || !card) return;
  const textoDisponibilidad = obtenerDisponibilidadProducto(card);
  const esTodasDisponibles = textoDisponibilidad === LABEL_ALL_AVAILABLE;

  disponibilidadElem.textContent = textoDisponibilidad;
  disponibilidadElem.classList.toggle("is-all-available", esTodasDisponibles);
  disponibilidadElem.style.display = "block";
}

function actualizarPreciosModal(card) {
  const precioMayorElem = document.getElementById("modalPrecioMayor");
  const precioDetalElem = document.getElementById("modalPrecioDetal");
  const precioCantidadElem = document.getElementById("modalPrecioCantidad");
  const accionRevendedor = document.getElementById("modalRevendedorAction");
  if (!precioMayorElem || !card) return;
  const modoEdicion = document.body.classList.contains("modo-edicion");
  const modoMayorista = mostrarPrecioMayor && !modoEdicion;
  const modoInterno = modoMayorista || modoEdicion;

  if (modoInterno) {
    const precioBase = card.dataset.precioMayor || "$0.00";
    precioMayorElem.style.display = "block";
    precioMayorElem.textContent = `Precio neto: ${formatearPrecio(precioBase)}`;
    if (accionRevendedor) accionRevendedor.hidden = false;
  } else {
    precioMayorElem.style.display = "none";
    if (accionRevendedor) accionRevendedor.hidden = true;
  }

  if (precioDetalElem) {
    precioDetalElem.hidden = !modoEdicion && (modoMayorista || card.dataset.mostrarPrecioDetal !== "true");
    precioDetalElem.textContent = `Precio al detal: ${formatearPrecio(card.dataset.precioDetal || "$0.00")}`;
  }
  if (precioCantidadElem) {
    precioCantidadElem.hidden = !modoEdicion && card.dataset.mostrarPrecioCantidad !== "true";
    precioCantidadElem.textContent = `Precio especial por cantidad: ${formatearPrecio(card.dataset.precioCantidad || "$0.00")}`;
  }
}

/* ================= ALTERNANCIA DE ESLOGAN ================= */
function iniciarAlternanciaEslogan() {
  const sp1 = document.querySelector('.header-tagline.SP1');
  const sp2 = document.querySelector('.header-tagline.SP2');
  
  if (!sp1 || !sp2) return;
  
  let mostrandoSP1 = true;
  
  setInterval(() => {
    if (mostrandoSP1) {
      // Fade out SP1, fade in SP2
      sp1.classList.add('fade-out');
      sp2.classList.add('fade-in');
    } else {
      // Fade out SP2, fade in SP1
      sp1.classList.remove('fade-out');
      sp2.classList.remove('fade-in');
    }
    mostrandoSP1 = !mostrandoSP1;
  }, 8000);
}

/* ================= INICIALIZAR PRODUCTOS PROMOCIONALES Y NOVEDADES ================= */
function inicializarProductosPromocionales() {
  const cards = document.querySelectorAll('.card');
  
  cards.forEach(card => {
    const cardInfo = card.querySelector('.card-info');
    const h3 = card.querySelector('.card-info h3');
    
    if (!cardInfo) return;
    
    // Remover elemento anterior si existe
    cardInfo.querySelectorAll('.card-label').forEach(label => label.remove());

    const esPromo = card.classList.contains('promo');
    const esNuevo = card.classList.contains('new');

    if (!esPromo && !esNuevo) return;

    const labelElement = document.createElement('p');

    if (esPromo && esNuevo) {
      labelElement.className = 'card-label card-label-combo';
      labelElement.textContent = 'Oferta + Nuevo';
    } else if (esPromo) {
      labelElement.className = 'card-label card-label-promo';
      labelElement.textContent = 'Oferta';
    } else {
      labelElement.className = 'card-label card-label-new';
      labelElement.textContent = 'Nuevo';
    }

    if (h3) {
      cardInfo.insertBefore(labelElement, h3);
    } else {
      cardInfo.prepend(labelElement);
    }
  });
}

/* ================= CONFIGURAR EVENT LISTENERS ================= */
function inicializarCarruselCategorias(nav) {
  if (!nav || nav.dataset.carruselInicializado === "true") return;
  const originalButtons = [...nav.querySelectorAll("button[data-category]")];
  if (originalButtons.length < 2) return;

  nav.dataset.carruselInicializado = "true";
  const originalCount = originalButtons.length;
  const addCloneSet = () => {
    originalButtons.forEach((button) => {
      const clone = button.cloneNode(true);
      clone.dataset.circularClone = "true";
      clone.setAttribute("aria-label", `${button.textContent.trim()}, siguiente vuelta`);
      nav.appendChild(clone);
    });
  };

  addCloneSet();
  const getCycleWidth = () => nav.querySelectorAll("button[data-category]")[originalCount].offsetLeft - originalButtons[0].offsetLeft;
  let cycleWidth = getCycleWidth();
  if (!cycleWidth) return;
  let cloneSets = 1;
  while (nav.scrollWidth < cycleWidth + nav.clientWidth && cloneSets < 8) {
    addCloneSet();
    cloneSets += 1;
  }
  window.addEventListener("resize", () => {
    cycleWidth = getCycleWidth();
    while (nav.scrollWidth < cycleWidth + nav.clientWidth && cloneSets < 8) {
      addCloneSet();
      cloneSets += 1;
    }
  });

  let previousScrollLeft = nav.scrollLeft;
  let isResetting = false;
  nav.addEventListener("scroll", () => {
    if (isResetting) return;
    const currentScrollLeft = nav.scrollLeft;
    let nextScrollLeft = null;
    if (currentScrollLeft >= cycleWidth) {
      nextScrollLeft = currentScrollLeft - cycleWidth;
    } else if (currentScrollLeft <= 0 && previousScrollLeft > 0) {
      nextScrollLeft = currentScrollLeft + cycleWidth;
    }

    if (nextScrollLeft !== null) {
      isResetting = true;
      nav.scrollLeft = nextScrollLeft;
      previousScrollLeft = nav.scrollLeft;
      requestAnimationFrame(() => { isResetting = false; });
      return;
    }
    previousScrollLeft = currentScrollLeft;
  }, { passive: true });
}

function configurarEventListeners() {
  // Buscador
  const searchInput = document.getElementById("search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (grupoEspecialActivo) {
        grupoEspecialActivo = null;
        const url = new URL(window.location.href);
        url.searchParams.delete("grupo");
        window.history.replaceState(null, "", url);
      }
      filtrar();
      actualizarBotonUrlEspecial();
    });
  }

  const copySearchUrlButton = document.getElementById("copySpecialSearchUrl");
  if (copySearchUrlButton) {
    copySearchUrlButton.addEventListener("click", copiarUrlBusquedaEspecial);
  }

  // Botones de categoría
  const categoryNav = document.getElementById("catNav");
  if (categoryNav) {
    inicializarCarruselCategorias(categoryNav);
    categoryNav.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-category]");
      if (button && categoryNav.contains(button)) filtrarCategoria(button.dataset.category, button);
    });
  }
  
  // Toggle de columnas del grid
  const toggleGridBtn = document.getElementById("toggleGridColumns");
  if (toggleGridBtn) {
    toggleGridBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const siguiente = avanzarCicloColumnas();
      aplicarPreferenciaColumnasGrid();
    });
  }
  
  aplicarPreferenciaColumnasGrid();
  window.addEventListener("resize", aplicarPreferenciaColumnasGrid);
  
  // Botón Ver Ubicación
  const openLocationBtn = document.getElementById("openLocationVideo");
  if (openLocationBtn) {
    openLocationBtn.addEventListener("click", (e) => {
      e.preventDefault();
      abrirModalVideo();
    });
  }

  const openImageDownloadSectionBtn = document.getElementById("openImageDownloadSection");
  if (openImageDownloadSectionBtn) {
    openImageDownloadSectionBtn.addEventListener("click", (e) => {
      e.preventDefault();
      activarModoDescargaImagenes();
      cerrarMenu();
    });
  }

  const descargarImagenesBtn = document.getElementById("descargarImagenesSeleccionadas");
  if (descargarImagenesBtn) {
    descargarImagenesBtn.addEventListener("click", descargarImagenesSeleccionadas);
  }
  
  // Menú hamburguesa
  const menuToggle = document.getElementById("menuToggle");
  const menuClose = document.getElementById("menuClose");
  const menuOverlay = document.getElementById("menuOverlay");
  const sideMenu = document.getElementById("sideMenu");
  
  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      sideMenu.classList.add("active");
      menuOverlay.classList.add("active");
      document.body.style.overflow = "hidden";
      menuToggle.setAttribute("aria-expanded", "true");
    });
  }
  
  if (menuClose) {
    menuClose.addEventListener("click", cerrarMenu);
  }
  
  if (menuOverlay) {
    menuOverlay.addEventListener("click", cerrarMenu);
  }

  // Cerrar modal de vendedores al tocar fuera del cuadro
  const modalVendedor = document.getElementById("modalVendedor");
  if (modalVendedor) {
    modalVendedor.addEventListener("click", (e) => {
      if (e.target === modalVendedor) {
        cancelarModalVendedor();
      }
    });
  }
  
  // Enlaces del menú lateral
  document.querySelectorAll(".menu-link").forEach(link => {
    link.addEventListener("click", (e) => {
      const category = e.currentTarget.dataset.category;
      if (category) {
        e.preventDefault();

        if (modoDescargaImagenes) {
          desactivarModoDescargaImagenes();
        }
        
        // Actualizar estado activo
        document.querySelectorAll(".menu-link").forEach(l => l.classList.remove("active"));
        e.currentTarget.classList.add("active");
        
        // Filtrar por categoría
        filtrarCategoria(category, null);
        
        // Cerrar menú
        cerrarMenu();
      }
    });
  });

  const catalog = document.getElementById("catalogo");
  if (catalog) {
    catalog.addEventListener("click", (event) => {
      if (modoDescargaImagenes) return;
      const card = event.target.closest(".card");
      if (!card || !catalog.contains(card)) return;
      if (event.target.closest("button, a, input, select, textarea, label, [contenteditable='true']")) return;

      const image = card.querySelector("img");
      if (image) abrirModal(image);
    });
  }

  // Botón flotante con teclado
  const floatBtn = document.querySelector(".float-wa");
  if (floatBtn) {
    floatBtn.addEventListener("keypress", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        enviarWA();
      }
    });
  }

  // Abrir collage al tocar/clic en la imagen del modal de producto
  const modalImg = document.getElementById("modalImg");
  if (modalImg) {
    modalImg.style.cursor = "zoom-in";
    modalImg.addEventListener("click", abrirModalCollage);
    modalImg.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrirModalCollage();
      }
    });
  }

  const modalCollage = document.getElementById("modalCollage");
  if (modalCollage) {
    modalCollage.addEventListener("click", (e) => {
      if (e.target === modalCollage) {
        cerrarModalCollage();
      }
    });
  }

  const descargarSeleccionModal = document.getElementById("modalDescargarSeleccionadas");
  if (descargarSeleccionModal) {
    descargarSeleccionModal.addEventListener("click", descargarSeleccionRevendedor);
  }
}

/* ================= CARRUSEL EN CARTAS ================= */
function iniciarCarruelesCartas() {
  document.querySelectorAll(".card").forEach(card => {
    if (card._carouselInterval) {
      clearInterval(card._carouselInterval);
      card._carouselInterval = null;
    }
    const imgs = (card.dataset.images || '').split(',').map(s => s.trim()).filter(Boolean);

    const firmaImagenes = imgs.join(",");
    if (card._carouselImagesSignature === firmaImagenes) return;
    card._carouselImagesSignature = firmaImagenes;
    card.dataset.images = firmaImagenes;

    if (imgs.length > 1) {
      const indiceInicial = Math.floor(Math.random() * imgs.length);
      card.dataset.imgIndex = String(indiceInicial);
      const imagen = card.querySelector("img");
      const rect = card.getBoundingClientRect();
      const visible = rect.bottom > 0 && rect.top < window.innerHeight;
      if (imagen && visible) imagen.src = imgs[indiceInicial];
    } else {
      delete card.dataset.imgIndex;
    }
  });

  if (intervaloCarruselesTarjetas) return;
  intervaloCarruselesTarjetas = setInterval(() => {
    if (document.hidden) return;

    document.querySelectorAll(".card").forEach(card => {
      if (card.style.display === "none") return;
      const rect = card.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight ||
          rect.right <= 0 || rect.left >= window.innerWidth) return;

      const imagenes = (card.dataset.images || "").split(",").map(path => path.trim()).filter(Boolean);
      const imagen = card.querySelector("img");
      if (!imagen || imagenes.length < 2) return;

      const indiceActual = Number.parseInt(card.dataset.imgIndex, 10) || 0;
      const nuevoIndice = (indiceActual + 1) % imagenes.length;
      card.dataset.imgIndex = String(nuevoIndice);
      imagen.src = imagenes[nuevoIndice];
    });
  }, 5000);
}

/* ================= ABRIR MODAL ================= */
function abrirModal(img){
  try {
    const card = img.closest(".card");
    if (!card) return;
    window.cardModalActual = card;
    
    const nombre = card.dataset.nombre || "Producto";
    const descripcion = card.dataset.descripcion || "Producto de alta calidad.";
    const agotado = card.classList.contains("agotado");
    productoActual = nombre;

    document.getElementById("modalImg").src = img.src;
    document.getElementById("modalImg").alt = nombre;
    
    // Usar textContent en lugar de innerHTML para seguridad
    document.getElementById("modalNombre").textContent = nombre;
    document.getElementById("modalDesc").textContent = descripcion;
    actualizarDisponibilidadModal(card);
    actualizarEtiquetaFraganciaModal(nombre);
    
    actualizarPreciosModal(card);

    // --- Carousel automático: leer imágenes y empezar interval ---
    // Limpiar interval previo si existe
    if(window.modalInterval){
      clearInterval(window.modalInterval);
      window.modalInterval = null;
    }

    // Obtener imágenes desde data-images; si no existe, usar la imagen del card como fallback
    let imgs = (card.dataset.images || '').split(',').map(s=>s.trim()).filter(Boolean);
    if(!imgs.length){
      const cardImg = card.querySelector('img');
      if(cardImg && cardImg.src){
        imgs = [cardImg.src];
      }
    }

    if(imgs.length){
      window.modalImages = imgs;
      window.modalIndex = 0;

      const srcActual = img.getAttribute("src") || img.src || "";
      const indexDesdeCard = window.modalImages.findIndex(ruta => {
        if (!ruta || !srcActual) return false;
        return ruta === srcActual || srcActual.includes(ruta);
      });
      if (indexDesdeCard >= 0) {
        window.modalIndex = indexDesdeCard;
      }

      // mostrar la imagen actual según el índice calculado
      mostrarImagenModal(window.modalIndex);
      // iniciar rotación automática solo si hay más de una imagen
      if(window.modalImages.length > 1){
        window.modalInterval = setInterval(()=>{
          window.modalIndex = (window.modalIndex + 1) % window.modalImages.length;
          mostrarImagenModal(window.modalIndex);
        }, 2500);
      } else {
        // asegurar que no haya interval activo
        if(window.modalInterval){
          clearInterval(window.modalInterval);
          window.modalInterval = null;
        }
      }
    } else {
      window.modalImages = null;
      window.modalIndex = null;
    }

    actualizarBotonModal(card);

    document.getElementById("modalImagen").classList.add("activo");
  } catch (error) {
    console.error("Error al abrir modal:", error);
  }
}

function actualizarBotonModal(card) {
  const modalBtn = document.getElementById("modalBtn");
  if (!modalBtn || !card) return;

  const agotado = card.classList.contains("agotado");
  const seleccionado = seleccion.includes(card.dataset.nombre);
  modalBtn.disabled = agotado;
  modalBtn.classList.toggle("selected", seleccionado && !agotado);
  modalBtn.setAttribute("aria-pressed", String(seleccionado && !agotado));
  modalBtn.textContent = agotado
    ? "Producto Agotado"
    : seleccionado
      ? "Quitar de consulta"
      : "Agregar a consulta";
}

function actualizarEtiquetaFraganciaModal(nombreProducto) {
  const etiqueta = document.getElementById("modalEtiquetaFragancia");
  const etiquetaSecundaria = document.getElementById("modalEtiquetaFraganciaSecundaria");
  if (!etiqueta || !etiquetaSecundaria) return;

  const nombre = (nombreProducto || "").toLowerCase();
  etiqueta.classList.remove("activa", "pos-left", "pos-right");
  etiqueta.textContent = "";
  etiquetaSecundaria.classList.remove("activa", "pos-left", "pos-right");
  etiquetaSecundaria.textContent = "";

  if (nombre.includes("combo irresistible")) {
    etiqueta.textContent = "Crema";
    etiqueta.classList.add("activa", "pos-left");
    etiquetaSecundaria.textContent = "Splash";
    etiquetaSecundaria.classList.add("activa", "pos-right");
    return;
  }

  if (nombre.includes("splash victoria's secret")) {
    etiqueta.textContent = "Splash";
    etiqueta.classList.add("activa", "pos-right");
    return;
  }

  if (nombre.includes("cremas victoria's secret")) {
    etiqueta.textContent = "Crema";
    etiqueta.classList.add("activa", "pos-left");
  }
}

async function ejecutarAccionRevendedor(card) {
  if (!card || (!mostrarPrecioMayor && !document.body.classList.contains("modo-edicion"))) return;

  const nombre = card.dataset.nombre || "";
  const descripcion = card.dataset.descripcion || "";
  const disponibilidad = obtenerDisponibilidadProducto(card);
  const precioBase = String(card.dataset.precioMayor || "$0.00");
  const precioFinal = formatearPrecioConImpuesto(precioBase);
  const texto = [nombre, descripcion, disponibilidad, precioFinal].join("\n");
  let textoCopiado = false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      textoCopiado = true;
    } catch (error) {
      console.warn("No se pudo usar el portapapeles moderno; se intentará el método alternativo.", error);
    }
  }

  if (!textoCopiado) {
    const temp = document.createElement("textarea");
    temp.value = texto;
    document.body.appendChild(temp);
    temp.select();
    textoCopiado = document.execCommand("copy");
    temp.remove();
  }

  const esTodasDisponibles = disponibilidad === LABEL_ALL_AVAILABLE;
  if (esTodasDisponibles) {
    const imagenes = (card.dataset.images || "").split(",").map((src) => src.trim()).filter(Boolean);
    imagenes.forEach((src, index) => {
      const btn = document.createElement("a");
      btn.href = src;
      btn.download = `${(nombre || "producto").replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${index + 1}.jpg`;
      btn.style.display = "none";
      document.body.appendChild(btn);
      setTimeout(() => btn.click(), index * 120);
      setTimeout(() => btn.remove(), index * 140 + 400);
    });
    alert(textoCopiado
      ? "Se copió la información del producto y se descargaron las imágenes."
      : "No se pudo copiar el texto, pero se descargaron las imágenes.");
    return;
  }

  window.modalSelectionMode = true;
  const modalCollage = document.getElementById("modalCollage");
  if (modalCollage) {
    const images = (card.dataset.images || "").split(",").map((src) => src.trim()).filter(Boolean);
    const grid = document.getElementById("modalCollageGrid");
    const title = document.getElementById("modalCollageTitle");
    const downloadButton = document.getElementById("modalDescargarSeleccionadas");
    if (grid && images.length) {
      seleccionImagenesModal.clear();
      grid.innerHTML = "";
      if (title) title.textContent = "Selecciona las imágenes que deseas descargar";
      if (downloadButton) {
        downloadButton.hidden = false;
        downloadButton.textContent = "Descargar seleccionadas";
      }
      images.forEach((src, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "modal-collage-item modal-collage-selectable";
        item.setAttribute("aria-pressed", "false");
        item.setAttribute("aria-label", `Seleccionar imagen ${index + 1} de ${nombre || "producto"}`);
        const img = document.createElement("img");
        img.src = src;
        img.alt = `${nombre || "Producto"} ${index + 1}`;
        img.loading = "lazy";
        item.appendChild(img);
        item.addEventListener("click", () => {
          const selected = seleccionImagenesModal.has(index);
          if (selected) seleccionImagenesModal.delete(index);
          else seleccionImagenesModal.add(index);
          item.classList.toggle("selected", !selected);
          item.setAttribute("aria-pressed", String(!selected));
        });
        grid.appendChild(item);
      });
      modalCollage.classList.add("activo");
    }
  }

  alert(textoCopiado
    ? "Se copió el texto del producto. Selecciona las imágenes que quieras descargar manualmente."
    : "No se pudo copiar el texto. Selecciona las imágenes que quieras descargar manualmente.");
}

function descargarSeleccionRevendedor() {
  const card = window.cardModalActual;
  const modoInterno = mostrarPrecioMayor || document.body.classList.contains("modo-edicion");
  if (!modoInterno || !card || !seleccionImagenesModal.size) {
    alert("Selecciona al menos una imagen para descargar.");
    return;
  }

  const nombre = (card.dataset.nombre || "producto").replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const images = (card.dataset.images || "").split(",").map((src) => src.trim()).filter(Boolean);
  [...seleccionImagenesModal].forEach((index, downloadIndex) => {
    const src = images[index];
    if (!src) return;
    const link = document.createElement("a");
    link.href = src;
    link.download = `${nombre}-${index + 1}.jpg`;
    link.style.display = "none";
    document.body.appendChild(link);
    setTimeout(() => link.click(), downloadIndex * 120);
    setTimeout(() => link.remove(), downloadIndex * 140 + 400);
  });
  cerrarModalCollage();
  alert(`Se descargaron ${seleccionImagenesModal.size} imágenes seleccionadas.`);
  seleccionImagenesModal.clear();
}

/* ================= CERRAR MODAL ================= */
function cerrarModal(){
  const modal = document.getElementById("modalImagen");
  if (modal) modal.classList.remove("activo");
  cerrarModalCollage();
  actualizarEtiquetaFraganciaModal("");
  productoActual = null;
  window.cardModalActual = null;
  if (window.modalSelectionMode) {
    window.modalSelectionMode = false;
  }
  if(window.modalInterval){
    clearInterval(window.modalInterval);
    window.modalInterval = null;
  }
}

/* Cerrar modal al hacer clic fuera de él */
document.addEventListener("click", (e) => {
  const modal = document.getElementById("modalImagen");
  if(e.target === modal){
    cerrarModal();
  }
});

/* ================= FUNCIONES MODAL VIDEO UBICACIÓN ================= */
const UBICACIONES = {
  central: {
    nombre: "La Central/5 de Mayo",
    mapa: "https://maps.app.goo.gl/DWtGvc5EM9KhMFn7A"
  },
  chorrera: {
    nombre: "La Chorrera",
    mapa: "https://maps.app.goo.gl/qMDoze4bM9T3ZFrk9"
  }
};

function abrirModalVideo(){
  const modalVideo = document.getElementById("modalVideo");
  if (!modalVideo) return;
  volverAUbicaciones();
  modalVideo.style.display = "flex";
  cerrarMenu();
}

function elegirUbicacion(idUbicacion) {
  const ubicacion = UBICACIONES[idUbicacion];
  if (!ubicacion) return;

  const seleccionUbicacion = document.getElementById("seleccionUbicacion");
  const opcionesUbicacion = document.getElementById("opcionesUbicacion");
  const titulo = document.getElementById("tituloUbicacionSeleccionada");
  const enlaceMaps = document.getElementById("enlaceGoogleMaps");
  if (!seleccionUbicacion || !opcionesUbicacion || !titulo || !enlaceMaps) return;

  titulo.textContent = ubicacion.nombre;
  enlaceMaps.href = ubicacion.mapa;
  seleccionUbicacion.hidden = true;
  opcionesUbicacion.hidden = false;
}

function volverAUbicaciones() {
  const seleccionUbicacion = document.getElementById("seleccionUbicacion");
  const opcionesUbicacion = document.getElementById("opcionesUbicacion");
  if (seleccionUbicacion) seleccionUbicacion.hidden = false;
  if (opcionesUbicacion) opcionesUbicacion.hidden = true;
}

function cerrarModalVideo(){
  const modalVideo = document.getElementById("modalVideo");
  if (modalVideo) modalVideo.style.display = "none";
}

// Cerrar modal de video al hacer clic fuera
document.addEventListener("click", (e) => {
  const modVid = document.getElementById("modalVideo");
  if(e.target === modVid){
    cerrarModalVideo();
  }
});

/* ================= AGREGAR DESDE MODAL ================= */
function agregarDelModal(){
  if(!productoActual) return;
  
  const cardActual = window.cardModalActual;
  if(cardActual && cardActual.classList.contains("agotado")) return;
  
  if(seleccion.includes(productoActual)){
    seleccion = seleccion.filter(p => p !== productoActual);
  } else {
    seleccion.push(productoActual);
  }

  guardarSeleccion();
  actualizarContador(true);
  actualizarBotonWA();
  
  restaurarSeleccion();
  actualizarBotonModal(cardActual);
  
  setTimeout(() => cerrarModal(), 300);
}

/* ================= SELECCIONAR PRODUCTO ================= */
function toggleProducto(btn){
  const card = btn.closest(".card");
  if (!card) return;
  const nombre = card.dataset.nombre;
  const agotado = card.classList.contains("agotado");

  if(agotado) return; // No permite agregar si está agotado

  if(seleccion.includes(nombre)){
    seleccion = seleccion.filter(p => p !== nombre);
  } else {
    seleccion.push(nombre);
  }

  guardarSeleccion();
  actualizarContador(true);
  actualizarBotonWA();
  restaurarSeleccion();
}

/* ================= GUARDAR SELECCIÓN ================= */
function guardarSeleccion(){
  localStorage.setItem("seleccion", JSON.stringify(seleccion));
}

/* ================= RESTAURAR SELECCIÓN ================= */
function restaurarSeleccion(){
  const tarjetas = document.querySelectorAll(".card");
  const productosDisponibles = new Set(
    Array.from(tarjetas)
      .filter(card => !card.classList.contains("agotado"))
      .map(card => card.dataset.nombre)
  );
  const seleccionActualizada = seleccion.filter(nombre => productosDisponibles.has(nombre));
  if (seleccionActualizada.length !== seleccion.length) {
    seleccion = seleccionActualizada;
    guardarSeleccion();
  }

  tarjetas.forEach(card => {
    const nombre = card.dataset.nombre;
    const btn = card.querySelector(".card-info > button");
    const agotado = card.classList.contains("agotado");
    if (!btn) return;

    if(agotado){
      btn.disabled = true;
      btn.classList.remove("selected");
      card.classList.remove("seleccionado");
      btn.textContent = "Agotado";
      btn.setAttribute("aria-pressed", "false");
    } else if(seleccion.includes(nombre)){
      btn.disabled = false;
      btn.classList.add("selected");
      card.classList.add("seleccionado");
      btn.textContent = "Agregado";
      btn.setAttribute("aria-pressed", "true");
    } else {
      btn.disabled = false;
      btn.classList.remove("selected");
      card.classList.remove("seleccionado");
      btn.textContent = "Agregar";
      btn.setAttribute("aria-pressed", "false");
    }
  });
  if (window.cardModalActual) actualizarBotonModal(window.cardModalActual);
}

/* ================= CONTADOR ================= */
function actualizarContador(animar=false){
  const count = document.getElementById("count");
  count.textContent = seleccion.length;

  if(animar){
    count.style.transform = "scale(1.3)";
    setTimeout(()=> count.style.transform = "scale(1)", 200);
  }
}

/* ================= BOTÓN WHATSAPP ================= */
function actualizarBotonWA(){
  const btn = document.querySelector(".float-wa");

  if(seleccion.length === 0){
    btn.style.backgroundColor = "gray";
    btn.style.pointerEvents = "none";
  } else {
    btn.style.backgroundColor = "var(--wa)";
    btn.style.pointerEvents = "auto";
  }
}

function enviarWA() {
    if (!seleccion.length) return;

    if (APP_CONFIG.numeroFijo) {
      finalizarYEnviar(APP_CONFIG.numeroFijo);
      return;
    }

    // Mostrar el modal de vendedores
    const modalVen = document.getElementById("modalVendedor");
    const listaVen = document.getElementById("listaVendedores");
    const timerDisplay = document.getElementById("timer");
    if (!modalVen || !listaVen || !timerDisplay) return;
    
    listaVen.innerHTML = ""; // Limpiar
    modalVen.style.display = "flex";
    clearInterval(intervaloTimer);
    tiempoRestante = 5;
    timerDisplay.textContent = tiempoRestante;

    // Crear botones de vendedores
    VENDEDORES.forEach((v) => {
        const btn = document.createElement("button");
        btn.className = "btn-vendedor";
        btn.textContent = v.nombre;
        btn.onclick = () => finalizarYEnviar(v.numero);
        listaVen.appendChild(btn);
    });

    // Iniciar cuenta regresiva
    intervaloTimer = setInterval(() => {
        tiempoRestante--;
        timerDisplay.textContent = tiempoRestante;
        if (tiempoRestante <= 0) {
            clearInterval(intervaloTimer);
            finalizarYEnviar(VENDEDORES[0].numero);
        }
    }, 1000);
}

function finalizarYEnviar(numeroDestino) {
    clearInterval(intervaloTimer);
    const modal = document.getElementById("modalVendedor");
    if (modal) {
      modal.style.display = "none";
    }

  const catalogoUrl = window.location.href;
  const listaProductos = seleccion.map((prod, i) => `${i + 1}. ${prod}`).join("\n");

  const msg = [
    catalogoUrl,
    "",
    "Hola, equipo de Home Style.",
    "",
    `Quisiera cotizar ${seleccion.length} producto(s):`,
    listaProductos,
    "",
    "Gracias. Quedo atento(a)."
  ].join("\n");

    // Eliminar guion y agregar 507 para la URL de WhatsApp
    const numeroLimpio = numeroDestino.replace('-', '');
    window.open(`https://wa.me/507${numeroLimpio}?text=${encodeURIComponent(msg)}`, "_blank");
}

  function cancelarModalVendedor() {
    clearInterval(intervaloTimer);
    const modalVen = document.getElementById("modalVendedor");
    if (modalVen) modalVen.style.display = "none";
  }

/* ================= BUSCADOR ================= */
/* ================= DISTANCIA DE LEVENSHTEIN (FUZZY SEARCH) ================= */
function distanciaLevenshtein(a, b) {
  const matA = a.split('');
  const matB = b.split('');
  const matriz = [];
  
  for (let i = 0; i <= matB.length; i++) {
    matriz[i] = [i];
  }
  
  for (let j = 0; j <= matA.length; j++) {
    matriz[0][j] = j;
  }
  
  for (let i = 1; i <= matB.length; i++) {
    for (let j = 1; j <= matA.length; j++) {
      const costo = matA[j - 1] === matB[i - 1] ? 0 : 1;
      matriz[i][j] = Math.min(
        matriz[i][j - 1] + 1,
        matriz[i - 1][j] + 1,
        matriz[i - 1][j - 1] + costo
      );
    }
  }
  
  return matriz[matB.length][matA.length];
}

/* ================= BÚSQUEDA FUZZY ================= */
function coincideFuzzy(texto, consulta, tolerancia = 2) {
  // Si la consulta está vacía, todo coincide
  if (!consulta) return true;
  
  // 1. Búsqueda exacta (prioridad máxima)
  if (texto.includes(consulta)) return true;
  
  // 2. Búsqueda por palabras individuales
  const palabrasTexto = texto.split(/\s+/);
  const palabrasConsulta = consulta.split(/\s+/);
  
  for (const pConsulta of palabrasConsulta) {
    let encontrada = false;
    
    for (const pTexto of palabrasTexto) {
      const distancia = distanciaLevenshtein(pConsulta, pTexto);
      
      // Permitir si la distancia es menor o igual a la tolerancia
      if (distancia <= tolerancia) {
        encontrada = true;
        break;
      }
    }
    
    if (!encontrada) {
      return false;
    }
  }
  
  return true;
}

function normalizarTextoBusqueda(valor) {
  return (valor || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function recolectarImagenesParaDescarga() {
  const listaImagenes = [];
  let contadorImagen = 0;

  document.querySelectorAll(".categoria").forEach(sec => {
    const categoria = sec.dataset.categoria || "Todos";

    sec.querySelectorAll(".card").forEach(card => {
      const nombreProducto = card.dataset.nombre || "Producto";
      const lista = (card.dataset.images || "")
        .split(",")
        .map(img => img.trim())
        .filter(Boolean);

      if (!lista.length) {
        const imgCard = card.querySelector("img");
        if (imgCard?.getAttribute("src")) {
          lista.push(imgCard.getAttribute("src").trim());
        }
      }

      lista.forEach(ruta => {
        if (!ruta || ruta.includes("img/categoria/00/0.jpeg")) return;

        contadorImagen += 1;
        listaImagenes.push({
          id: `img-descarga-${contadorImagen}`,
          src: ruta,
          categoria,
          nombre: nombreProducto
        });
      });
    });
  });

  imagenesDescarga = listaImagenes;
}

function actualizarEstadoDescargaImagenes() {
  const estado = document.getElementById("descargaImagenesEstado");
  if (!estado) return;

  const cantidad = seleccionImagenesDescarga.size;
  estado.textContent = `${cantidad} imágenes seleccionadas`;
}

function crearNombreDescarga(src, index) {
  const limpio = (src || "").split("?")[0];
  const partes = limpio.split("/");
  const archivo = partes[partes.length - 1] || `imagen-${index + 1}.jpeg`;
  const carpeta = partes.length >= 2 ? partes[partes.length - 2] : "catalogo";
  return `${carpeta}-${archivo}`;
}

function renderizarGaleriaDescarga() {
  if (!modoDescargaImagenes) return;

  const grid = document.getElementById("descargaImagenesGrid");
  if (!grid) return;

  const q = normalizarTextoBusqueda(document.getElementById("search")?.value || "");
  const categoriaObjetivo = categoriaBaseActual || "Todos";

  const lista = imagenesDescarga.filter(item => {
    if (categoriaObjetivo !== "Todos" && item.categoria !== categoriaObjetivo) {
      return false;
    }

    if (!q) return true;

    const texto = normalizarTextoBusqueda(`${item.nombre} ${item.categoria} ${item.src}`);
    return coincideFuzzy(texto, q);
  });

  grid.innerHTML = "";

  if (!lista.length) {
    const vacio = document.createElement("p");
    vacio.className = "descarga-imagenes-vacio";
    vacio.textContent = "No hay imágenes para mostrar con esos filtros.";
    grid.appendChild(vacio);
    actualizarEstadoDescargaImagenes();
    return;
  }

  lista.forEach(item => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "descarga-imagen-item";
    boton.setAttribute("aria-label", `Seleccionar imagen de ${item.nombre}`);

    if (seleccionImagenesDescarga.has(item.id)) {
      boton.classList.add("selected");
    }

    const imagen = document.createElement("img");
    imagen.src = item.src;
    imagen.alt = "Imagen de producto";
    imagen.loading = "lazy";

    const marca = document.createElement("span");
    marca.className = "descarga-imagen-check";
    marca.textContent = "✓";

    const nombre = document.createElement("span");
    nombre.className = "descarga-imagen-nombre";
    nombre.textContent = item.nombre;

    boton.appendChild(imagen);
    boton.appendChild(marca);
    boton.appendChild(nombre);

    boton.addEventListener("click", () => {
      if (seleccionImagenesDescarga.has(item.id)) {
        seleccionImagenesDescarga.delete(item.id);
        boton.classList.remove("selected");
      } else {
        seleccionImagenesDescarga.add(item.id);
        boton.classList.add("selected");
      }
      actualizarEstadoDescargaImagenes();
    });

    grid.appendChild(boton);
  });

  actualizarEstadoDescargaImagenes();
}

function activarModoDescargaImagenes() {
  if (!imagenesDescarga.length) {
    recolectarImagenesParaDescarga();
  }

  modoDescargaImagenes = true;
  categoriaBaseActual = "Todos";

  const seccionDescarga = document.getElementById("seccionDescargaImagenes");
  const buscador = document.getElementById("search");
  const botonMenuDescarga = document.getElementById("openImageDownloadSection");
  const botonFlotante = document.querySelector(".float-wa");

  document.querySelectorAll("#catalogo .categoria").forEach(sec => {
    sec.style.display = "none";
  });
  if (seccionDescarga) seccionDescarga.style.display = "";
  if (botonFlotante) botonFlotante.style.display = "none";

  if (buscador) {
    buscador.value = "";
    buscador.placeholder = PLACEHOLDER_BUSCADOR_DESCARGA;
  }
  actualizarBotonUrlEspecial();

  document.querySelectorAll("nav button").forEach(btn => {
    const esTodos = btn.dataset.category === "Todos";
    btn.classList.toggle("active", esTodos);
    btn.setAttribute("aria-pressed", esTodos ? "true" : "false");
  });

  document.querySelectorAll(".menu-link").forEach(link => link.classList.remove("active"));
  if (botonMenuDescarga) botonMenuDescarga.classList.add("active");

  renderizarGaleriaDescarga();
}

function desactivarModoDescargaImagenes() {
  if (!modoDescargaImagenes) return;

  modoDescargaImagenes = false;
  const seccionDescarga = document.getElementById("seccionDescargaImagenes");
  const buscador = document.getElementById("search");
  const botonFlotante = document.querySelector(".float-wa");
  const botonMenuDescarga = document.getElementById("openImageDownloadSection");

  document.querySelectorAll("#catalogo .categoria").forEach(sec => {
    sec.style.display = "";
  });
  if (seccionDescarga) seccionDescarga.style.display = "none";
  if (botonFlotante) botonFlotante.style.display = "";
  if (botonMenuDescarga) botonMenuDescarga.classList.remove("active");

  if (buscador) {
    buscador.value = "";
    buscador.placeholder = PLACEHOLDER_BUSCADOR_NORMAL;
  }
  actualizarBotonUrlEspecial();
}

function descargarImagenesSeleccionadas() {
  if (!seleccionImagenesDescarga.size) {
    alert("Selecciona al menos una imagen para descargar.");
    return;
  }

  const seleccionadas = imagenesDescarga.filter(item => seleccionImagenesDescarga.has(item.id));

  seleccionadas.forEach((item, index) => {
    const enlace = document.createElement("a");
    enlace.href = item.src;
    enlace.download = crearNombreDescarga(item.src, index);
    document.body.appendChild(enlace);

    setTimeout(() => {
      enlace.click();
      enlace.remove();
    }, index * 120);
  });
}

function filtrar(){
  if (modoDescargaImagenes) {
    renderizarGaleriaDescarga();
    return;
  }

  const searchInput = document.getElementById("search");
  const q = normalizarTextoBusqueda(searchInput ? searchInput.value : "");
  const palabrasExactas = grupoEspecialActivo ? palabrasBusqueda(grupoEspecialActivo) : [];

  // El título visible de la tarjeta es el único texto considerado por el buscador.
  document.querySelectorAll(".card").forEach(card=>{
    try {
      const titulo = normalizarTextoBusqueda(card.querySelector(".card-info h3")?.textContent || "");
      const seccion = card.closest(".categoria");
      const perteneceCategoria = categoriaBaseActual === "Todos" || seccion?.dataset.categoria === categoriaBaseActual;
      const agotadoOculto = categoriaBaseActual === "Todos" && card.classList.contains("agotado");
      const visiblePorBusqueda = palabrasExactas.length
        ? palabrasExactas.every((word) => palabrasBusqueda(titulo).includes(word))
        : !q || coincideFuzzy(titulo, q);
      const visible = perteneceCategoria && !agotadoOculto && !card.classList.contains("sin-imagenes-publicas") && visiblePorBusqueda;
      card.style.display = visible ? "" : "none";
    } catch (error) {
      console.error("Error en filtro de card:", error);
    }
  });

  // Ocultar categorías sin productos visibles
  document.querySelectorAll(".categoria").forEach(seccion=>{
    const tieneVisibles = Array.from(seccion.querySelectorAll(".card")).some(card => card.style.display !== "none");
    seccion.style.display = tieneVisibles ? "" : "none";
  });
}

/* ================= FILTRO POR CATEGORÍA ================= */
function filtrarCategoria(cat, btn){
  if (!cat) return; // Validación de seguridad

  const categoriasBase = new Set([
    "Todos", "Forros", "Comedor", "Sábanas", "Alfombras", "Electrónicos", "Almohadas", "Fragancias", "Frazadas", "Toallas", "Mochilas", "Carteras", "Baño", "Cortinas", "Accesorios", "Otros"
  ]);

  if (modoDescargaImagenes) {
    if (!categoriasBase.has(cat)) return;

    categoriaBaseActual = cat;

    document.querySelectorAll("nav button").forEach(b=>{
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });

    if (btn) {
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
    }

    renderizarGaleriaDescarga();
    const seccion = document.getElementById("seccionDescargaImagenes");
    if (seccion) {
      seccion.scrollIntoView({ behavior:"smooth", block:"start" });
    }
    return;
  }

  if (!categoriasBase.has(cat)) return;
  categoriaBaseActual = cat;

  aplicarOrdenPrioridadEnTarjetas();
  const buscador = document.getElementById("search");
  if (buscador) {
    buscador.value = grupoEspecialActivo ? grupoEspecialActivo.replace(/-/g, " ") : "";
  }
  actualizarBotonUrlEspecial();

  document.querySelectorAll("nav button").forEach(b=>{
    b.classList.remove("active");
    b.setAttribute("aria-pressed", "false");
  });
  
  if (btn) {
    btn.classList.add("active");
    btn.setAttribute("aria-pressed", "true");
  }

  const baseEsTodos = categoriaBaseActual === "Todos";
  const mostrarAgotadosEnTodos = false;

  document.querySelectorAll(".categoria").forEach(sec => {
    const esCategoriaBase = baseEsTodos || sec.dataset.categoria === categoriaBaseActual;
    sec.style.display = esCategoriaBase ? "" : "none";
  });

  document.querySelectorAll(".card").forEach(card => {
    const sec = card.closest(".categoria");
    const dentroBase = sec && (baseEsTodos || sec.dataset.categoria === categoriaBaseActual);

    if (!dentroBase) {
      card.style.display = "none";
      return;
    }

    if (baseEsTodos && !mostrarAgotadosEnTodos && card.classList.contains("agotado")) {
      card.style.display = "none";
      return;
    }

    if (card.classList.contains("sin-imagenes-publicas")) {
      card.style.display = "none";
      return;
    }

    card.style.display = "";
  });

  document.querySelectorAll(".categoria").forEach(sec => {
    const tieneVisibles = Array.from(sec.querySelectorAll(".card")).some(card =>
      card.style.display !== "none" && !card.classList.contains("sin-imagenes-publicas")
    );
    sec.style.display = tieneVisibles ? "" : "none";
  });

  const target = document.querySelector(`.categoria[data-categoria="${categoriaBaseActual}"]`)
    || document.querySelector(".categoria");

  if (grupoEspecialActivo) filtrar();

  if (target) {
    target.scrollIntoView({ behavior:"smooth", block:"start" });
  }
}

function mostrarImagenModal(index){
  if(!window.modalImages || !window.modalImages.length) return;

  const total = window.modalImages.length;
  const indexNormalizado = ((index % total) + total) % total;
  window.modalIndex = indexNormalizado;

  const modalImg = document.getElementById("modalImg");
  if(!modalImg) return;

  modalImg.src = window.modalImages[indexNormalizado];
}

function abrirModalCollage(){
  if(!window.modalImages || !window.modalImages.length) return;

  const modalCollage = document.getElementById("modalCollage");
  const modalCollageGrid = document.getElementById("modalCollageGrid");
  if(!modalCollage || !modalCollageGrid) return;

  modalCollageGrid.innerHTML = "";

  window.modalImages.forEach((src, index) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = `${productoActual || "Producto"} - imagen ${index + 1}`;
    img.loading = "lazy";
    img.className = "modal-collage-item";
    img.addEventListener("click", () => {
      window.modalIndex = index;
      mostrarImagenModal(index);
      cerrarModalCollage();
    });
    modalCollageGrid.appendChild(img);
  });

  modalCollage.classList.add("activo");
}

function cerrarModalCollage(){
  const modalCollage = document.getElementById("modalCollage");
  if(modalCollage){
    modalCollage.classList.remove("activo");
  }
  const downloadButton = document.getElementById("modalDescargarSeleccionadas");
  if (downloadButton) downloadButton.hidden = true;
  const title = document.getElementById("modalCollageTitle");
  if (title) title.textContent = "Imágenes del producto";
  window.modalSelectionMode = false;
}