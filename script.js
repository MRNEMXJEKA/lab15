// Фреймворк: Vue 3 (через CDN, без збірки).
// Дані списку бажань зберігаються локально: основне сховище — IndexedDB,
// localStorage — простий варіант із кроків 2–4 і джерело для одноразової міграції.

// Адреса власного локального сервера (практикум 14) замість зовнішнього JSONPlaceholder.
// Відносний шлях: сторінку й API роздає той самий Node-сервер, тому окреме налаштування CORS не потрібне.
const API_URL = "/api/wishes";

// Режим зберігання: true — IndexedDB (основний), false — лише localStorage (для демонстрації кроків 2–4)
const USE_INDEXED_DB = true;

// Ключі localStorage
const LS_KEY = "wishlistItems";
const MIGRATED_KEY = "wishlistMigrated";

// Схема IndexedDB: база WishlistDB, версія 1, сховище "wishes" з ключем "id"
const DB_NAME = "WishlistDB";
const DB_VERSION = 1;
const STORE_NAME = "wishes";

// Безпека (практикум 15): у href допускаються лише абсолютні посилання http/https.
// javascript:, data: та інші схеми з форми, сервера чи сховища відкидаються — повертається порожній рядок.
function safeUrl(value) {
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

// Модель запису: { id, title, price, url, purchased, saved } + priority та image з попередніх практикумів.
// saved — сума, вже накопичена на купівлю (для прогрес-бару практикуму 12).
// Ці бажання з'являються лише під час найпершого запуску, коли сховище ще порожнє.
const DEFAULT_WISHES = [
  {
    id: 1,
    title: "Новий ноутбук",
    price: 109999,
    url: "https://rozetka.com.ua/",
    purchased: false,
    saved: 30000,
    priority: "високий",
    image: "https://content.rozetka.com.ua/goods/images/big/677460228.jpg",
  },
  {
    id: 2,
    title: "Навушники",
    price: 3399,
    url: "https://rozetka.com.ua/",
    purchased: false,
    saved: 2500,
    priority: "середній",
    image: "https://content.rozetka.com.ua/goods/images/big/595395804.jpg",
  },
  {
    id: 3,
    title: "Книга з програмування",
    price: 1500,
    url: "https://www.manning.com/books/grokking-algorithms",
    purchased: false,
    saved: 0,
    priority: "низький",
    image:
      "https://work.njae.me.uk/content/images/size/w2000/2018/04/grokking-algorithms.png",
  },
];


// Зберігає весь масив бажань у localStorage як JSON-рядок
function saveToLocalStorage(items) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

// Читає масив бажань з localStorage; пошкоджений JSON не «ламає» застосунок — повертається порожній список
function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Пошкоджені дані в localStorage:", error);
    return [];
  }
}


let dbPromise = null;

// Відкриває базу WishlistDB; під час першого відкриття (onupgradeneeded) створює сховище "wishes" з keyPath "id"
function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB не підтримується цим браузером"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // Якщо відкрити не вдалося — наступний виклик спробує знову
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

// Записує бажання в транзакції readwrite; put створює новий запис або оновлює наявний з тим самим id
async function putItem(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Create: додає нове бажання
async function addItem(item) {
  await putItem(item);
}

// Update: оновлює бажання (наприклад, позначку purchased)
async function updateItem(item) {
  await putItem(item);
}

// Read: повертає всі бажання зі сховища (транзакція readonly)
async function getAllItems() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Delete: видаляє бажання за id (транзакція readwrite)
async function deleteItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Одноразова міграція: якщо сховище порожнє, переносить дані з localStorage (або початкові бажання
// під час найпершого запуску) і ставить прапорець, щоб перенесення не повторювалося
async function migrateFromLocalStorage() {
  if (localStorage.getItem(MIGRATED_KEY) === "true") {
    return 0;
  }

  const existing = await getAllItems();
  let moved = 0;

  if (existing.length === 0) {
    const hasSavedData = localStorage.getItem(LS_KEY) !== null;
    const source = hasSavedData ? loadFromLocalStorage() : DEFAULT_WISHES;
    for (const item of source) {
      await addItem(item);
    }
    moved = hasSavedData ? source.length : 0;
  }

  localStorage.setItem(MIGRATED_KEY, "true");
  return moved;
}


// Картка бажання: отримує дані лише через props; чекбокс «Куплено» передає toggle(id), кнопка — remove(id)
const WishItem = {
  props: {
    id: { type: Number, required: true },
    title: { type: String, required: true },
    price: { type: Number, default: null },
    url: { type: String, default: "" },
    priority: { type: String, default: "середній" },
    image: { type: String, default: "" },
    purchased: { type: Boolean, default: false },
    saved: { type: Number, default: 0 },
  },
  emits: ["toggle", "remove", "save"],

  data() {
    return {
      amount: null,
    };
  },

  computed: {
    // Відсоток накопиченого від ціни: 0–100; куплене бажання вважається накопиченим повністю
    percent() {
      if (this.purchased) {
        return 100;
      }
      if (!this.price) {
        return 0;
      }
      return Math.min(100, Math.round((this.saved / this.price) * 100));
    },
    // Безпечна адреса товару для href (практикум 15): порожня, якщо схема не http/https
    safeHref() {
      return safeUrl(this.url);
    },
  },

  methods: {
    // Передає батьківському компоненту суму, яку користувач відклав на цей товар
    submitSaving() {
      if (!this.amount || this.amount <= 0) {
        return;
      }
      this.$emit("save", this.id, this.amount);
      this.amount = null;
    },
  },

  template: `
    <article
      class="wish"
      :class="{ 'priority-high': priority === 'високий', bought: purchased }"
      :data-priority="priority"
    >
      <img v-if="image" :src="image" :alt="title" />
      <h3 class="wish__name">
        <a :href="'#/wishes/' + id" data-link>{{ title }}</a>
      </h3>
      <p v-if="price !== null" class="wish__price">{{ price.toFixed(2) }} грн</p>
      <p class="wish__priority-label">Пріоритет: {{ priority }}</p>
      <a v-if="safeHref" class="wish__link" :href="safeHref" target="_blank" rel="noopener">Переглянути товар</a>

      <!-- Прогрес-бар «накопичено на купівлю»: ширина заповнення анімується CSS transition -->
      <div v-if="price" class="saving">
        <div class="saving__header">
          <span v-if="purchased">Куплено</span>
          <span v-else>Накопичено: {{ saved.toFixed(2) }} з {{ price.toFixed(2) }} грн</span>
          <span class="saving__percent">{{ percent }}%</span>
        </div>
        <div
          class="progress-bar"
          :class="{ 'progress-bar--complete': percent === 100 }"
          role="progressbar"
          aria-label="Накопичено на купівлю"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="percent"
        >
          <div class="progress-bar__fill" :style="{ width: percent + '%' }"></div>
        </div>
        <form v-if="!purchased && percent < 100" class="saving__form" @submit.prevent="submitSaving">
          <input
            type="number"
            min="1"
            step="1"
            v-model.number="amount"
            placeholder="Сума, грн"
            aria-label="Скільки відкласти на цей товар"
          />
          <button type="submit" class="btn-save">Відкласти</button>
        </form>
      </div>
      <div class="wish__actions">
        <label class="wish__bought">
          <input type="checkbox" :checked="purchased" @change="$emit('toggle', id)" />
          Куплено
        </label>
        <button type="button" class="btn-delete" @click="$emit('remove', id)">Видалити</button>
      </div>
    </article>
  `,
};

// Hash-based роутинг: адреса маршруту зберігається після «#» (наприклад, #/wishes/21),
// тож сторінка не перезавантажується, а F5 на будь-якому маршруті працює навіть без сервера.

// View-функції: кожна описує, що показати в контейнері #page-view.
// Картки рендерить той самий компонент WishItem, що й раніше (замінив функцію рендеру з практикуму 7),
// а дані беруться з IndexedDB/localStorage (практикум 11).

// «/» — усі бажання та форма додавання
function viewHome() {
  return {
    page: "list",
    title: "Список бажань",
    filter: "all",
    showForm: true,
    emptyText: "Список порожній — додайте перше бажання через форму.",
  };
}

// «/purchased» — лише куплені бажання (purchased: true)
function viewPurchased() {
  return {
    page: "list",
    title: "Куплені бажання",
    filter: "purchased",
    showForm: false,
    emptyText: "Ще немає куплених бажань.",
  };
}

// «/wishes/:id» — деталі одного товару; id береться з параметра маршруту
function viewWishDetail(params) {
  return { page: "detail", id: Number(params.id) };
}

// Неіснуючий маршрут — сторінка «Не знайдено»
function viewNotFound(path) {
  return { page: "not-found", path };
}

// Таблиця маршрутів: патерн шляху → view-функція (":id" — параметр)
const routes = [
  { path: "/", view: viewHome },
  { path: "/wishes/:id", view: viewWishDetail },
  { path: "/purchased", view: viewPurchased },
];

// Порівнює шлях із патернами по сегментах і витягує параметри; null — маршрут не знайдено
function matchRoute(path) {
  const pathParts = path.split("/").filter(Boolean);
  for (const route of routes) {
    const routeParts = route.path.split("/").filter(Boolean);
    if (routeParts.length !== pathParts.length) {
      continue;
    }
    const params = {};
    const isMatch = routeParts.every((part, i) => {
      if (part.startsWith(":")) {
        params[part.slice(1)] = decodeURIComponent(pathParts[i]);
        return true;
      }
      return part === pathParts[i];
    });
    if (isMatch) {
      return { view: route.view, params };
    }
  }
  return null;
}

// Програмний перехід: змінює хеш, а подія hashchange викликає рендер
function navigate(path) {
  location.hash = path;
}

// Кореневий компонент: стан списку завжди береться зі сховища
const app = Vue.createApp({
  components: { WishItem },

  data() {
    return {
      wishes: [],
      newTitle: "",
      newPrice: null,
      newUrl: "",
      newPriority: "середній",
      loading: false,
      statusText: "",
      isError: false,
      storageReady: false,
      storageError: "",
      useIndexedDB: USE_INDEXED_DB,
      route: viewHome(),
    };
  },

  computed: {
    // Сума цін ще не куплених бажань
    total() {
      return this.wishes
        .filter((wish) => !wish.purchased)
        .reduce((sum, wish) => sum + (wish.price || 0), 0);
    },
    // Бажання для поточної сторінки-списку: усі або лише куплені
    visibleWishes() {
      if (this.route.filter === "purchased") {
        return this.wishes.filter((wish) => wish.purchased);
      }
      return this.wishes;
    },
    // Товар для сторінки деталей: шукаємо запис за id з параметра маршруту
    currentWish() {
      if (this.route.page !== "detail") {
        return null;
      }
      return this.wishes.find((wish) => wish.id === this.route.id) || null;
    },
    // Безпечне посилання для сторінки деталей (практикум 15)
    currentWishHref() {
      return this.currentWish ? safeUrl(this.currentWish.url) : "";
    },
    purchasedCount() {
      return this.wishes.filter((wish) => wish.purchased).length;
    },
  },

  async mounted() {
    await this.initStorage();
  },

  methods: {
    // Готує сховище: IndexedDB з міграцією; якщо база недоступна — показує повідомлення й переходить на localStorage
    async initStorage() {
      if (this.useIndexedDB) {
        try {
          await openDB();
          const moved = await migrateFromLocalStorage();
          if (moved > 0) {
            console.log(`Перенесено з localStorage в IndexedDB: ${moved}`);
          }
          await this.refresh();
          this.storageReady = true;
          return;
        } catch (error) {
          console.error("Не вдалося відкрити IndexedDB:", error);
          this.storageError =
            "Не вдалося відкрити локальну базу даних. Можливо, увімкнено приватний режим перегляду. " +
            "Список працює у спрощеному режимі й зберігається лише в localStorage.";
          this.useIndexedDB = false;
        }
      }

      if (localStorage.getItem(LS_KEY) === null) {
        saveToLocalStorage(DEFAULT_WISHES);
      }
      this.wishes = loadFromLocalStorage();
      this.storageReady = true;
    },

    // Перечитує список з IndexedDB — на екрані завжди те, що реально збережено
    async refresh() {
      this.wishes = await getAllItems();
    },

    // Застосовує зміну до активного сховища: IndexedDB (операція + перечитування) або localStorage (весь масив)
    async applyChange(dbAction, localAction) {
      try {
        if (this.useIndexedDB) {
          await dbAction();
          await this.refresh();
        } else {
          localAction();
          saveToLocalStorage(this.wishes);
        }
      } catch (error) {
        console.error("Не вдалося зберегти зміни:", error);
        this.isError = true;
        this.statusText = "Не вдалося зберегти зміни. Спробуйте ще раз";
      }
    },

    // Додає нове бажання з форми
    async addWish() {
      if (this.newTitle === "") {
        return;
      }
      // Практикум 15: посилання з небезпечною схемою (javascript: тощо) не зберігаємо
      const url = safeUrl(this.newUrl);
      if (this.newUrl && !url) {
        this.isError = true;
        this.statusText = "Посилання має починатися з http:// або https://";
        return;
      }
      const wish = {
        id: Date.now(),
        title: this.newTitle,
        price: this.newPrice,
        url,
        purchased: false,
        saved: 0,
        priority: this.newPriority,
      };
      await this.applyChange(
        () => addItem(wish),
        () => this.wishes.push(wish)
      );
      this.newTitle = "";
      this.newPrice = null;
      this.newUrl = "";
      this.newPriority = "середній";
    },

    // Позначає бажання купленим / некупленим: put з оновленим полем purchased
    async togglePurchased(id) {
      const wish = this.wishes.find((w) => w.id === id);
      if (!wish) {
        return;
      }
      const updated = { ...wish, purchased: !wish.purchased };
      await this.applyChange(
        () => updateItem(updated),
        () => {
          wish.purchased = updated.purchased;
        }
      );
    },

    // Додає відкладену суму до накопиченого (не більше ціни товару) і зберігає запис через put;
    // зміна saved змінює ширину прогрес-бару, а CSS transition робить це плавно
    async addSaving(id, amount) {
      const wish = this.wishes.find((w) => w.id === id);
      if (!wish || !wish.price) {
        return;
      }
      const saved = Math.min(wish.price, (wish.saved || 0) + amount);
      const updated = { ...wish, saved };
      await this.applyChange(
        () => updateItem(updated),
        () => {
          wish.saved = saved;
        }
      );
    },

    // Видаляє бажання зі списку: delete за id
    async removeWish(id) {
      await this.applyChange(
        () => deleteItem(id),
        () => {
          this.wishes = this.wishes.filter((w) => w.id !== id);
        }
      );
      // Якщо товар видалено зі сторінки деталей — повертаємося до списку
      if (this.route.page === "detail" && this.route.id === id) {
        navigate("/");
      }
    },

    // Перевіряє ціну під час введення: від'ємне значення -> власне повідомлення
    validatePrice(event) {
      const input = event.target;
      if (input.value !== "" && Number(input.value) < 0) {
        input.setCustomValidity("Ціна не може бути від'ємною");
        input.reportValidity();
      } else {
        input.setCustomValidity("");
      }
    },

    // Завантажує бажання з локального сервера (GET /api/wishes, практикум 14)
    // і зберігає лише ті, яких ще немає в списку; обробка помилок — як у практикумі 9
    async importFromApi() {
      this.loading = true;
      this.isError = false;
      this.statusText = "Завантаження…";

      try {
        const response = await fetch(API_URL);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();

        // Сервер повертає бажання вже у форматі застосунку — додаємо лише ті, яких ще немає
        const existingIds = new Set(this.wishes.map((w) => w.id));
        const newWishes = data
          .filter((wish) => !existingIds.has(wish.id))
          .map((wish) => ({
            id: wish.id,
            title: wish.title,
            price: wish.price ?? null,
            url: safeUrl(wish.url), // дані з сервера теж перевіряємо
            purchased: Boolean(wish.purchased),
            priority: wish.priority || "середній",
            image: wish.image || "",
            saved: wish.saved || 0,
          }));

        await this.applyChange(
          async () => {
            for (const wish of newWishes) {
              await addItem(wish);
            }
          },
          () => this.wishes.push(...newWishes)
        );

        if (!this.isError) {
          this.statusText = newWishes.length
            ? `Додано нових бажань: ${newWishes.length}`
            : "Усі бажання з сервера вже є у списку";
        }
      } catch (error) {
        this.isError = true;
        this.statusText =
          error instanceof TypeError
            ? "Список бажань недоступний офлайн"
            : "Не вдалося завантажити список бажань. Спробуйте пізніше";
        console.error("Помилка завантаження списку бажань:", error);
      } finally {
        this.loading = false;
      }
    },
  },
});
const vm = app.mount("#app");

// Рендер поточного маршруту: шлях з хеша → matchRoute → view-функція → новий стан сторінки
function render() {
  const path = location.hash.slice(1) || "/";
  const match = matchRoute(path);
  const view = match ? match.view(match.params) : viewNotFound(path);
  vm.route = { ...view, path };

  // Підсвічуємо активний пункт меню
  document.querySelectorAll("nav a[data-link]").forEach((link) => {
    if (link.getAttribute("href") === "#" + path) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  window.scrollTo(0, 0);
}

// Перехоплення кліків по внутрішніх посиланнях: замість звичайного переходу — navigate()
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-link]");
  if (!link) {
    return;
  }
  event.preventDefault();
  navigate(link.getAttribute("href").slice(1));
});

// Кнопки «назад»/«вперед» і ручна зміна адреси змінюють хеш — перемальовуємо сторінку
window.addEventListener("hashchange", render);
render();

/*
  Функцію ручного рендеру з практикуму 7 замінено компонентом WishItem і директивою v-for.
  Vue сам створює й оновлює картки, тому querySelector, createElement та innerHTML
  для списку більше не потрібні.

function renderWishes(items) {
  listContainer.innerHTML = '';
  items.forEach((wish, index) => {
    const card = document.createElement('article');
    ...
    listContainer.append(card);
  });
}
*/
