(function () {
  const EDIT_MODE = new URLSearchParams(window.location.search).get("modo") === "edicion";
  const TABLE = "catalog_products";
  const BUCKET = "product-images";
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  const config = window.CATALOGO_SUPABASE_CONFIG || {};
  const categoryNames = Array.from(document.querySelectorAll("#catNav [data-category]"))
    .map((button) => button.dataset.category)
    .filter((name) => !["Todos", "Promociones", "Novedades", "Agotados", "Proximamente"].includes(name));
  const state = {
    client: null,
    rows: [],
    editor: false,
    authOverlay: null,
    editorBar: null,
    realtimeTimer: null
  };

  function makeClient() {
    if (!window.supabase || !config.url || !config.anonKey) return null;
    return window.supabase.createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  function showNotice(message, isError) {
    let notice = document.getElementById("cloudCatalogNotice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "cloudCatalogNotice";
      notice.className = "cloud-catalog-notice";
      notice.setAttribute("role", "status");
      document.body.appendChild(notice);
    }
    notice.textContent = message;
    notice.classList.toggle("cloud-catalog-notice-error", Boolean(isError));
    notice.hidden = false;
    window.clearTimeout(notice._hideTimer);
    notice._hideTimer = window.setTimeout(() => { notice.hidden = true; }, 7000);
  }

  function makeOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "editor-auth-overlay";
    overlay.innerHTML = `
      <section class="editor-auth-card" role="dialog" aria-modal="true" aria-labelledby="editorAuthTitle">
        <img src="img_logo_logo.png" alt="" class="editor-auth-logo">
        <p class="editor-auth-kicker">HOMESTYLE507 · EQUIPO</p>
        <h1 id="editorAuthTitle">Acceso de editores</h1>
        <p class="editor-auth-copy">Inicia sesión con la cuenta autorizada para administrar el catálogo.</p>
        <form id="editorLoginForm">
          <label for="editorEmail">Correo electrónico</label>
          <input id="editorEmail" name="email" type="email" autocomplete="username" required>
          <label for="editorPassword">Contraseña</label>
          <input id="editorPassword" name="password" type="password" autocomplete="current-password" required>
          <button type="submit" class="editor-primary-button">Entrar al catálogo</button>
        </form>
        <p id="editorAuthMessage" class="editor-auth-message" aria-live="polite"></p>
        <a class="editor-customer-link" href="index.html">Volver a la página de clientes</a>
      </section>`;
    document.body.appendChild(overlay);
    state.authOverlay = overlay;
    return overlay;
  }

  function setAuthMessage(message, isError) {
    const target = document.getElementById("editorAuthMessage");
    if (!target) return;
    target.textContent = message;
    target.classList.toggle("is-error", Boolean(isError));
  }

  function showAuthGate(message) {
    if (!state.authOverlay) makeOverlay();
    state.authOverlay.hidden = false;
    document.body.classList.add("editor-auth-required");
    if (message) setAuthMessage(message, true);
  }

  function createEditIcon(onClick, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-pencil";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>';
    button.onclick = onClick;
    return button;
  }

  function rowForCard(card) {
    return state.rows.find((row) => row.id === card.dataset.cloudId);
  }

  function applyRowToCard(row, card) {
    card.dataset.cloudId = row.id;
    card.dataset.nombre = row.name;
    card.dataset.descripcion = row.description || "";
    card.dataset.precioMayor = row.net_price || "$0.00";
    card.dataset.images = (row.image_urls || []).join(",");
    card.classList.remove("agotado", "proximo", "proxima", "novedad", "promocion", "seguro-seguro");
    card.classList.add("card");
    if (row.status === "Agotado") card.classList.add("agotado");
    if (row.status === "Próximamente") card.classList.add("proximo");
    if (row.is_new) card.classList.add("novedad");
    if (row.is_promotion) card.classList.add("promocion");
    if (row.is_secure) card.classList.add("seguro-seguro");

    let badge = card.querySelector(".badge-seguro-seguro");
    if (row.is_secure && !badge) {
      badge = document.createElement("span");
      badge.className = "badge-seguro-seguro";
      badge.setAttribute("aria-label", "seguro/seguro");
      badge.textContent = "seguro/seguro";
      card.prepend(badge);
    } else if (!row.is_secure && badge) {
      badge.remove();
    }

    const imagePaths = row.image_urls || [];
    const image = card.querySelector("img");
    if (image && imagePaths.length) {
      image.src = imagePaths[0];
      image.alt = row.name;
    }
    const title = card.querySelector(".card-info h3");
    if (title) title.textContent = row.display_title || row.name;

    if (state.editor) addCardEditorControls(row, card);
  }

  function addCardEditorControls(row, card) {
    const info = card.querySelector(".card-info");
    const title = info && info.querySelector("h3");
    if (!info || !title) return;

    let titleButton = info.querySelector(".editor-title-pencil");
    if (!titleButton) {
      const titleRow = document.createElement("div");
      titleRow.className = "editor-title-row";
      title.parentNode.insertBefore(titleRow, title);
      titleRow.appendChild(title);
      titleButton = createEditIcon(() => beginInlineEdit(card, "display_title", title), "Editar título");
      titleButton.classList.add("editor-title-pencil");
      titleButton.dataset.editorControl = "true";
      titleRow.appendChild(titleButton);
    }
    titleButton.onclick = () => beginInlineEdit(card, "display_title", title);

    let priceRow = info.querySelector(".editor-card-price");
    if (!priceRow) {
      priceRow = document.createElement("div");
      priceRow.className = "editor-card-price";
      const price = document.createElement("span");
      price.className = "editor-card-price-value";
      priceRow.appendChild(price);
      priceRow.appendChild(createEditIcon(
        () => beginInlineEdit(card, "net_price", price),
        "Editar precio neto"
      ));
      info.appendChild(priceRow);
    }
    priceRow.querySelector(".editor-card-price-value").textContent = row.net_price || "$0.00";
    const priceButton = priceRow.querySelector(".editor-pencil");
    priceButton.dataset.editorControl = "true";
    priceButton.onclick = () => beginInlineEdit(
      card,
      "net_price",
      priceRow.querySelector(".editor-card-price-value")
    );
  }

  function createProductCard(row) {
    const card = document.createElement("article");
    card.className = "card";
    const image = document.createElement("img");
    image.loading = "lazy";
    const info = document.createElement("div");
    info.className = "card-info";
    const title = document.createElement("h3");
    const consult = document.createElement("button");
    consult.type = "button";
    consult.textContent = "Consultar";
    consult.addEventListener("click", () => window.toggleProducto(consult));
    info.append(title, consult);
    card.append(image, info);
    applyRowToCard(row, card);
    return card;
  }

  function renderCatalog(rows) {
    state.rows = rows;
    if (!rows.length) return;

    const sections = new Map(Array.from(document.querySelectorAll("#catalogo .categoria"))
      .map((section) => [section.dataset.categoria, section]));
    const existing = new Map();
    document.querySelectorAll("#catalogo .card").forEach((card) => {
      const section = card.closest(".categoria");
      existing.set(`${section.dataset.categoria}\u0000${card.dataset.nombre}`, card);
    });
    const retained = new Set();
    const categoryOrder = new Map(categoryNames.map((name, index) => [name, index]));

    rows.sort((a, b) =>
      (categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER) ||
      a.sort_order - b.sort_order ||
      a.display_title.localeCompare(b.display_title, "es")
    );

    rows.forEach((row) => {
      const section = sections.get(row.category);
      if (!section) {
        console.error(`Categoría desconocida en Supabase: ${row.category}`);
        return;
      }
      const grid = section.querySelector(".grid");
      const key = `${row.category}\u0000${row.name}`;
      const card = existing.get(key) || createProductCard(row);
      applyRowToCard(row, card);
      retained.add(card);
      grid.appendChild(card);
    });

    existing.forEach((card) => {
      if (!retained.has(card)) {
        if (card._carouselInterval) window.clearInterval(card._carouselInterval);
        card.remove();
      }
    });

    if (typeof window.iniciarCarruelesCartas === "function") {
      window.iniciarCarruelesCartas();
    }
    if (typeof window.filtrarCategoria === "function") {
      const activeCategory = document.querySelector("#catNav button.active")?.dataset.category || "Todos";
      window.filtrarCategoria(activeCategory, null);
    }
  }

  function staticProductsFromPage() {
    const products = [];
    document.querySelectorAll("#catalogo .categoria").forEach((section) => {
      let order = 0;
      section.querySelectorAll(".card").forEach((card) => {
        const imagePaths = (card.dataset.images || "").split(",").map((image) => image.trim()).filter(Boolean);
        if (!imagePaths.length) {
          const image = card.querySelector("img");
          if (image && image.getAttribute("src")) imagePaths.push(image.getAttribute("src"));
        }
        const classes = card.classList;
        const status = classes.contains("agotado")
          ? "Agotado"
          : classes.contains("proximo") || classes.contains("proxima")
            ? "Próximamente"
            : "Disponible";
        const title = card.querySelector(".card-info h3");
        products.push({
          category: section.dataset.categoria,
          name: card.dataset.nombre,
          display_title: title ? title.textContent.trim() : card.dataset.nombre,
          description: card.dataset.descripcion || "",
          net_price: card.dataset.precioMayor || "$0.00",
          status,
          is_new: classes.contains("novedad") || classes.contains("new"),
          is_promotion: classes.contains("promocion") || classes.contains("promo"),
          is_secure: classes.contains("seguro-seguro"),
          image_urls: imagePaths,
          sort_order: order++
        });
      });
    });
    return products;
  }

  async function fetchProducts() {
    const { data, error } = await state.client.from(TABLE).select("*").order("category").order("sort_order");
    if (error) throw error;
    return data || [];
  }

  async function loadCloudCatalog() {
    const rows = await fetchProducts();
    if (rows.length) {
      renderCatalog(rows);
      return;
    }
    if (state.editor) {
      await importInitialCatalog();
      return;
    }
    showNotice("El catálogo compartido aún no tiene productos inicializados.", true);
  }

  async function importInitialCatalog() {
    const products = staticProductsFromPage();
    if (!products.length) throw new Error("No se encontraron productos para iniciar el catálogo compartido.");
    const { error } = await state.client.from(TABLE).upsert(products, { onConflict: "category,name" });
    if (error) throw error;
    const rows = await fetchProducts();
    renderCatalog(rows);
    showNotice(`Catálogo compartido iniciado con ${rows.length} productos.`, false);
  }

  function setEditorMode(isEnabled, email) {
    state.editor = isEnabled;
    document.body.classList.toggle("modo-edicion", isEnabled);
    document.body.classList.toggle("modo-mayorista", isEnabled);
    if (isEnabled) {
      let robots = document.querySelector('meta[name="robots"]');
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "noindex, nofollow";
      state.authOverlay.hidden = true;
      document.body.classList.remove("editor-auth-required");
      showEditorBar(email);
      state.rows.forEach((row) => {
        const card = document.querySelector(`.card[data-cloud-id="${row.id}"]`);
        if (card) addCardEditorControls(row, card);
      });
      addModalEditorControls();
      return;
    }
    if (state.editorBar) state.editorBar.remove();
    document.querySelectorAll(".editor-inline-input").forEach((input) => {
      const target = input._editorTarget;
      if (target && input.isConnected) {
        target.textContent = input._editorOriginalText;
        input.replaceWith(target);
      }
    });
    document.querySelectorAll(".editor-product-panel, .editor-pencil, .editor-card-price").forEach((item) => item.remove());
    document.querySelectorAll(".editor-title-row").forEach((row) => {
      const title = row.querySelector("h3");
      if (title) row.replaceWith(title);
      else row.remove();
    });
    document.querySelectorAll(".editor-edit-row").forEach((row) => {
      const field = row.querySelector("#modalNombre, #modalDesc, #modalPrecioMayor");
      if (field) row.replaceWith(field);
      else row.remove();
    });
  }

  function showEditorBar(email) {
    if (!state.editorBar) {
      const bar = document.createElement("div");
      bar.className = "editor-toolbar";
      bar.innerHTML = `
        <div class="editor-toolbar-copy"><strong>Modo edición</strong><span>Los cambios se comparten con el catálogo de clientes.</span></div>
        <div class="editor-toolbar-actions">
          <span class="editor-user-email"></span>
          <button type="button" class="editor-primary-button editor-add-product">+ Nuevo producto</button>
          <button type="button" class="editor-secondary-button editor-sign-out">Cerrar sesión</button>
        </div>`;
      const header = document.querySelector(".main-header");
      header.insertAdjacentElement("afterend", bar);
      bar.querySelector(".editor-add-product").addEventListener("click", openNewProductForm);
      bar.querySelector(".editor-sign-out").addEventListener("click", async () => {
        const { error } = await state.client.auth.signOut();
        if (error) {
          showNotice(`No se pudo cerrar sesión: ${error.message}`, true);
          return;
        }
        window.location.replace("index.html");
      });
      state.editorBar = bar;
    }
    state.editorBar.querySelector(".editor-user-email").textContent = email || "";
  }

  async function isAuthorizedEditor(user) {
    const { data, error } = await state.client
      .from("catalog_editors")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async function activateEditor(user) {
    try {
      if (!(await isAuthorizedEditor(user))) {
        setEditorMode(false);
        showAuthGate("Esta cuenta no está autorizada como editora. Solicita acceso a la persona administradora.");
        await state.client.auth.signOut();
        return;
      }
      setEditorMode(true, user.email);
      await loadCloudCatalog();
      subscribeToChanges();
    } catch (error) {
      setEditorMode(false);
      showAuthGate(`No se pudo abrir el catálogo: ${error.message}`);
    }
  }

  function initializeEditorGate() {
    makeOverlay();
    showAuthGate();
    const form = document.getElementById("editorLoginForm");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      setAuthMessage("Verificando acceso…", false);
      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;
      const { data, error } = await state.client.auth.signInWithPassword({ email, password });
      button.disabled = false;
      if (error) {
        setAuthMessage(`No se pudo iniciar sesión: ${error.message}`, true);
        return;
      }
      await activateEditor(data.user);
    });

    state.client.auth.getSession().then(({ data, error }) => {
      if (error) {
        setAuthMessage(`No se pudo comprobar la sesión: ${error.message}`, true);
        return;
      }
      if (data.session) activateEditor(data.session.user);
    });
    state.client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setEditorMode(false);
        showAuthGate();
      }
    });
  }

  function subscribeToChanges() {
    if (state.channel) state.client.removeChannel(state.channel);
    state.channel = state.client.channel("catalog-products-live")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, () => {
        window.clearTimeout(state.realtimeTimer);
        state.realtimeTimer = window.setTimeout(async () => {
          try {
            renderCatalog(await fetchProducts());
          } catch (error) {
            showNotice(`No se pudo sincronizar el catálogo: ${error.message}`, true);
          }
        }, 250);
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          showNotice("La sincronización en vivo no está disponible. Comprueba Realtime en Supabase.", true);
        }
      });
  }

  function updateProduct(card, changes) {
    const row = rowForCard(card);
    if (!row) throw new Error("No se encontró el producto en el catálogo compartido.");
    const payload = { ...changes, updated_at: new Date().toISOString() };
    const updated = { ...row, ...payload };
    return state.client.from(TABLE).update(payload).eq("id", row.id).select().single()
      .then(({ data, error }) => {
        if (error) throw error;
        const index = state.rows.findIndex((item) => item.id === row.id);
        if (index >= 0) state.rows[index] = data;
        renderCatalog(state.rows);
        if (window.cardModalActual && window.cardModalActual.dataset.cloudId === row.id) {
          const currentCard = document.querySelector(`.card[data-cloud-id="${row.id}"]`);
          const currentImage = currentCard && currentCard.querySelector("img");
          if (currentImage) {
            window.abrirModal(currentImage);
            renderModalEditor(currentCard);
          }
        }
        return data || updated;
      });
  }

  function beginInlineEdit(card, field, target) {
    if (target.dataset.editing === "true") return;
    const row = rowForCard(card);
    if (!row) return;
    const original = row[field];
    const input = document.createElement(field === "description" ? "textarea" : "input");
    input.className = "editor-inline-input";
    input.value = original || "";
    input._editorTarget = target;
    input._editorOriginalText = target.textContent;
    if (field === "net_price") input.inputMode = "decimal";
    const saveButton = target.parentElement.querySelector(".editor-pencil") ||
      target.nextElementSibling;
    if (!saveButton) return;
    target.dataset.editing = "true";
    target.replaceWith(input);
    saveButton.classList.add("is-saving");
    saveButton.setAttribute("aria-label", "Aceptar cambio");
    saveButton.title = "Aceptar cambio";
    saveButton.innerHTML = '<span aria-hidden="true">✓</span>';
    saveButton.onclick = async () => {
      const value = input.value.trim();
      if (!value) {
        showNotice("El campo no puede quedar vacío.", true);
        input.focus();
        return;
      }
      saveButton.disabled = true;
      try {
        target.removeAttribute("data-editing");
        target.textContent = field === "net_price" && target.id === "modalPrecioMayor"
          ? `Precio neto: ${value}`
          : value;
        input.replaceWith(target);
        await updateProduct(card, { [field]: value });
        showNotice("Cambio guardado y compartido.", false);
      } catch (error) {
        saveButton.disabled = false;
        if (!input.isConnected && target.isConnected) target.replaceWith(input);
        showNotice(`No se pudo guardar: ${error.message}`, true);
        input.focus();
      }
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && input.tagName !== "TEXTAREA") {
        event.preventDefault();
        saveButton.click();
      }
      if (event.key === "Escape") {
        target.textContent = input._editorOriginalText;
        target.removeAttribute("data-editing");
        input.replaceWith(target);
        saveButton.classList.remove("is-saving");
        saveButton.setAttribute("aria-label", `Editar ${field === "net_price" ? "precio" : "texto"}`);
        saveButton.title = saveButton.getAttribute("aria-label");
        saveButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>';
        saveButton.onclick = () => beginInlineEdit(card, field, target);
      }
    });
    input.focus();
    input.select();
  }

  function wrapModalField(element, field, card, label) {
    let row = element.closest(".editor-edit-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "editor-edit-row";
      element.parentNode.insertBefore(row, element);
      row.appendChild(element);
    }
    let button = row.querySelector(".editor-pencil");
    if (!button) {
      button = createEditIcon(() => beginInlineEdit(card, field, element), `Editar ${label}`);
      button.dataset.editorControl = "true";
      row.appendChild(button);
    }
    button.onclick = () => beginInlineEdit(card, field, element);
  }

  function addModalEditorControls() {
    const body = document.querySelector("#modalImagen .modal-cuerpo");
    if (!body || body.querySelector(".editor-product-panel")) return;
    const panel = document.createElement("section");
    panel.className = "editor-product-panel";
    panel.innerHTML = `
      <h3>Detalles del producto</h3>
      <div class="editor-product-grid">
        <label>Categoría<select class="editor-category-select"></select></label>
        <label>Disponibilidad<select class="editor-status-select"></select></label>
      </div>
      <div class="editor-product-flags">
        <label><input type="checkbox" class="editor-new-flag"> Novedad</label>
        <label><input type="checkbox" class="editor-promo-flag"> Promoción</label>
        <label><input type="checkbox" class="editor-secure-flag"> Seguro/Seguro</label>
      </div>
      <div class="editor-image-manager">
        <h4>Fotos del producto</h4>
        <p>Desmarca las fotos que quieras quitar o agrega nuevas. Conserva al menos una foto.</p>
        <div class="editor-image-list"></div>
        <label class="editor-file-label">Agregar fotos
          <input class="editor-new-images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple>
        </label>
        <button type="button" class="editor-primary-button editor-save-images">Guardar fotos</button>
      </div>
      <div class="editor-panel-actions">
        <button type="button" class="editor-primary-button editor-save-options">Guardar detalles</button>
        <button type="button" class="editor-danger-button editor-delete-product">Eliminar producto</button>
      </div>`;
    body.appendChild(panel);
    const categorySelect = panel.querySelector(".editor-category-select");
    categoryNames.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });
    const statusSelect = panel.querySelector(".editor-status-select");
    ["Disponible", "Agotado", "Próximamente"].forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      statusSelect.appendChild(option);
    });
    panel.querySelector(".editor-save-options").addEventListener("click", async () => {
      const card = window.cardModalActual;
      if (!card) return;
      try {
        await updateProduct(card, {
          category: categorySelect.value,
          status: statusSelect.value,
          is_new: panel.querySelector(".editor-new-flag").checked,
          is_promotion: panel.querySelector(".editor-promo-flag").checked,
          is_secure: panel.querySelector(".editor-secure-flag").checked
        });
        window.cerrarModal();
        showNotice("Detalles guardados y compartidos.", false);
      } catch (error) {
        showNotice(`No se pudieron guardar los detalles: ${error.message}`, true);
      }
    });
    panel.querySelector(".editor-save-images").addEventListener("click", saveProductImages);
    panel.querySelector(".editor-delete-product").addEventListener("click", deleteCurrentProduct);
  }

  function renderModalEditor(card) {
    if (!state.editor || !card) return;
    addModalEditorControls();
    const row = rowForCard(card);
    if (!row) return;
    const name = document.getElementById("modalNombre");
    const description = document.getElementById("modalDesc");
    const price = document.getElementById("modalPrecioMayor");
    wrapModalField(name, "name", card, "nombre");
    wrapModalField(description, "description", card, "descripción");
    wrapModalField(price, "net_price", card, "precio");
    const panel = document.querySelector(".editor-product-panel");
    panel.querySelector(".editor-category-select").value = row.category;
    panel.querySelector(".editor-status-select").value = row.status;
    panel.querySelector(".editor-new-flag").checked = row.is_new;
    panel.querySelector(".editor-promo-flag").checked = row.is_promotion;
    panel.querySelector(".editor-secure-flag").checked = row.is_secure;
    const list = panel.querySelector(".editor-image-list");
    list.replaceChildren();
    (row.image_urls || []).forEach((url) => {
      const item = document.createElement("label");
      item.className = "editor-image-item";
      const image = document.createElement("img");
      image.src = url;
      image.alt = "Foto del producto";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = true;
      check.value = url;
      const text = document.createElement("span");
      text.textContent = "Conservar";
      item.append(image, check, text);
      list.appendChild(item);
    });
    panel.querySelector(".editor-new-images").value = "";
  }

  function storagePathFromUrl(url) {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const index = url.indexOf(marker);
    return index >= 0 ? decodeURIComponent(url.slice(index + marker.length)) : null;
  }

  async function uploadImages(files) {
    const paths = [];
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error(`Formato de imagen no compatible: ${file.name}`);
      }
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error(`${file.name} supera el límite de 10 MB.`);
      }
      const extension = file.name.split(".").pop().toLowerCase();
      const path = `products/${crypto.randomUUID()}.${extension}`;
      const { error } = await state.client.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false
      });
      if (error) throw error;
      paths.push({ path, url: state.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
    }
    return paths;
  }

  async function saveProductImages() {
    const card = window.cardModalActual;
    const row = card && rowForCard(card);
    if (!row) return;
    const panel = document.querySelector(".editor-product-panel");
    const keptUrls = Array.from(panel.querySelectorAll(".editor-image-item input:checked"))
      .map((input) => input.value);
    const files = Array.from(panel.querySelector(".editor-new-images").files || []);
    if (keptUrls.length + files.length === 0) {
      showNotice("El producto necesita conservar al menos una foto.", true);
      return;
    }
    const button = panel.querySelector(".editor-save-images");
    button.disabled = true;
    let uploads = [];
    try {
      uploads = await uploadImages(files);
      const finalImages = keptUrls.concat(uploads.map((image) => image.url));
      await updateProduct(card, { image_urls: finalImages });
      const removedStoragePaths = (row.image_urls || [])
        .filter((url) => !keptUrls.includes(url))
        .map(storagePathFromUrl)
        .filter(Boolean);
      if (removedStoragePaths.length) {
        const { error } = await state.client.storage.from(BUCKET).remove(removedStoragePaths);
        if (error) {
          showNotice(`Fotos actualizadas, pero algunas imágenes anteriores no se pudieron borrar: ${error.message}`, true);
          return;
        }
      }
      renderModalEditor(document.querySelector(`.card[data-cloud-id="${row.id}"]`));
      showNotice("Fotos actualizadas y compartidas.", false);
    } catch (error) {
      const uploadedPaths = uploads.map((image) => image.path);
      if (uploadedPaths.length) await state.client.storage.from(BUCKET).remove(uploadedPaths);
      showNotice(`No se pudieron guardar las fotos: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  }

  async function deleteCurrentProduct() {
    const card = window.cardModalActual;
    const row = card && rowForCard(card);
    if (!row || !window.confirm(`¿Eliminar "${row.display_title}" del catálogo para todos?`)) return;
    const { error } = await state.client.from(TABLE).delete().eq("id", row.id);
    if (error) {
      showNotice(`No se pudo eliminar: ${error.message}`, true);
      return;
    }
    const paths = (row.image_urls || []).map(storagePathFromUrl).filter(Boolean);
    if (paths.length) {
      const { error: storageError } = await state.client.storage.from(BUCKET).remove(paths);
      if (storageError) showNotice(`Producto eliminado; algunas fotos de respaldo no se pudieron borrar: ${storageError.message}`, true);
    }
    window.cerrarModal();
    showNotice("Producto eliminado del catálogo compartido.", false);
  }

  function openNewProductForm() {
    const dialog = document.createElement("dialog");
    dialog.className = "editor-new-product-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="editor-new-product-form">
        <button type="button" class="editor-dialog-close" aria-label="Cerrar">×</button>
        <p class="editor-auth-kicker">HOMESTYLE507 · CATÁLOGO</p>
        <h2>Agregar producto</h2>
        <p>Completa la información y selecciona sus fotos. Se verá en las dos páginas al guardar.</p>
        <label>Categoría<select name="category" required></select></label>
        <label>Nombre del producto<input name="name" required></label>
        <label>Título para la tarjeta<input name="display_title" required></label>
        <label>Descripción<textarea name="description" rows="4"></textarea></label>
        <div class="editor-product-grid">
          <label>Precio neto<input name="net_price" value="$0.00" required></label>
          <label>Disponibilidad<select name="status"><option>Disponible</option><option>Agotado</option><option>Próximamente</option></select></label>
        </div>
        <div class="editor-product-flags">
          <label><input type="checkbox" name="is_new"> Novedad</label>
          <label><input type="checkbox" name="is_promotion"> Promoción</label>
          <label><input type="checkbox" name="is_secure"> Seguro/Seguro</label>
        </div>
        <label class="editor-file-label">Fotos del producto<input name="images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple required></label>
        <p class="editor-auth-message editor-form-message" aria-live="polite"></p>
        <button type="submit" class="editor-primary-button">Guardar y compartir</button>
      </form>`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector("form");
    const category = form.elements.category;
    categoryNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      category.appendChild(option);
    });
    const close = () => { dialog.close(); dialog.remove(); };
    dialog.querySelector(".editor-dialog-close").addEventListener("click", close);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const save = form.querySelector('button[type="submit"]');
      const message = form.querySelector(".editor-form-message");
      save.disabled = true;
      message.textContent = "Subiendo fotos y guardando…";
      const uploaded = [];
      try {
        const imageFiles = Array.from(form.elements.images.files || []);
        if (!imageFiles.length) throw new Error("Selecciona al menos una foto.");
        const filesUploaded = await uploadImages(imageFiles);
        uploaded.push(...filesUploaded);
        const data = Object.fromEntries(new FormData(form).entries());
        const payload = {
          category: data.category,
          name: data.name.trim(),
          display_title: data.display_title.trim(),
          description: data.description.trim(),
          net_price: data.net_price.trim(),
          status: data.status,
          is_new: form.elements.is_new.checked,
          is_promotion: form.elements.is_promotion.checked,
          is_secure: form.elements.is_secure.checked,
          image_urls: filesUploaded.map((image) => image.url),
          sort_order: state.rows.filter((row) => row.category === data.category).length
        };
        const { error } = await state.client.from(TABLE).insert(payload);
        if (error) throw error;
        const rows = await fetchProducts();
        renderCatalog(rows);
        close();
        showNotice("Producto agregado y compartido con todos.", false);
      } catch (error) {
        if (uploaded.length) await state.client.storage.from(BUCKET).remove(uploaded.map((image) => image.path));
        message.textContent = `No se pudo agregar el producto: ${error.message}`;
        message.classList.add("is-error");
        save.disabled = false;
      }
    });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    dialog.showModal();
  }

  document.addEventListener("click", (event) => {
    const card = event.target.closest && event.target.closest(".card");
    if (card && state.editor && window.cardModalActual === card) {
      window.setTimeout(() => renderModalEditor(window.cardModalActual), 0);
    }
  });

  document.addEventListener("DOMContentLoaded", async () => {
    state.client = makeClient();
    if (EDIT_MODE) {
      document.body.classList.add("modo-edicion");
      let robots = document.querySelector('meta[name="robots"]');
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "noindex, nofollow";
      if (!state.client) {
        makeOverlay();
        state.authOverlay.querySelectorAll("input, button[type=submit]").forEach((control) => {
          control.disabled = true;
        });
        showAuthGate("La conexión segura del catálogo aún no está configurada.");
        return;
      }
      initializeEditorGate();
      return;
    }
    if (!state.client) return;
    try {
      await loadCloudCatalog();
      state.client.channel("catalog-products-customer")
        .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, () => {
          window.clearTimeout(state.realtimeTimer);
          state.realtimeTimer = window.setTimeout(async () => {
            try {
              renderCatalog(await fetchProducts());
              showNotice("El catálogo se actualizó.", false);
            } catch (error) {
              showNotice(`No se pudo actualizar el catálogo: ${error.message}`, true);
            }
          }, 250);
        })
        .subscribe();
    } catch (error) {
      showNotice(`No se pudo cargar el catálogo compartido: ${error.message}`, true);
      console.error("Error al cargar Supabase:", error);
    }
  });
})();
