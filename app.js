
const SUPABASE_URL = "https://fspkbodmxwktkkxrbfuq.supabase.co";
const SUPABASE_KEY = "sb_publishable_baGmp5kfrFUeiX_9ajNyRA_7ok32Ps2";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const screen = document.getElementById("screen");
const STORAGE_KEY = "babyNameMatchRoom";

const names = {
    girl: [
        "Варвара", "Эмилия", "Ася", "Ева", "Лилия",
        "Зоя", "Виктория", "Елизавета", "Кира"
    ],
    boy: [
        "Арсений", "Артур", "Виктор", "Леонид",
        "Михаил", "Матвей", "Семён"
    ]
};

let sessionUser = null;
let room = null;
let members = [];
let displayName = "";
let gender = "boy";
let votes = {};
let currentNames = [];
let currentIndex = 0;
let busy = false;
let pollTimer = null;

function savedRoom() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
        return null;
    }
}

function saveRoom() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        roomId: room.id,
        code: room.code,
        displayName
    }));
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function showError(error) {
    const message = error?.message || String(error);
    const old = document.getElementById("error-message");
    if (old) old.remove();

    const box = document.createElement("p");
    box.id = "error-message";
    box.className = "error";
    box.textContent = message;
    screen.prepend(box);
}

async function ensureSession() {
    const { data: { session }, error } = await db.auth.getSession();
    if (error) throw error;

    if (session) {
        sessionUser = session.user;
        return;
    }

    const result = await db.auth.signInAnonymously();
    if (result.error) throw result.error;
    sessionUser = result.data.user;
}

function home() {
    stopPolling();
    screen.innerHTML = `
        <section class="panel">
            <h2>Ваше имя — ваша история ❤️</h2>
            <p class="muted">Создайте комнату для вас двоих или присоединитесь к уже созданной.</p>
            <button class="primary" id="create-button">Создать комнату</button>
            <button class="secondary" id="join-button">Войти по коду</button>
        </section>`;
    document.getElementById("create-button").onclick = createForm;
    document.getElementById("join-button").onclick = joinForm;
}

function createForm() {
    screen.innerHTML = `
        <section class="panel">
            <h2>Создаём вашу комнату</h2>
            <p class="muted">Как к тебе обращаться?</p>
            <input id="creator-name" maxlength="40" placeholder="Твоё имя" autocomplete="given-name">
            <button class="primary" id="create-submit">Создать комнату ❤️</button>
            <button class="secondary" id="back-button">Назад</button>
        </section>`;
    document.getElementById("back-button").onclick = home;
    document.getElementById("create-submit").onclick = async () => {
        const input = document.getElementById("creator-name");
        const value = input.value.trim();
        if (!value) {
            input.focus();
            return;
        }

        busy = true;
        try {
            await ensureSession();
            const { data, error } = await db.rpc("create_room", {
                p_display_name: value
            });
            if (error) throw error;

            const created = Array.isArray(data) ? data[0] : data;
            room = { id: created.room_id, code: created.room_code };
            displayName = value;
            saveRoom();
            await refreshRoom();
        } catch (error) {
            showError(error);
        } finally {
            busy = false;
        }
    };
}

function joinForm() {
    screen.innerHTML = `
        <section class="panel">
            <h2>Войти в комнату</h2>
            <p class="muted">Введи код, которым поделился партнёр.</p>
            <input id="join-code" maxlength="6" placeholder="КОД КОМНАТЫ" autocapitalize="characters" autocomplete="off">
            <input id="join-name" maxlength="40" placeholder="Твоё имя" autocomplete="given-name">
            <button class="primary" id="join-submit">Присоединиться</button>
            <button class="secondary" id="back-button">Назад</button>
        </section>`;
    document.getElementById("back-button").onclick = home;
    document.getElementById("join-submit").onclick = async () => {
        const code = document.getElementById("join-code").value.trim().toUpperCase();
        const value = document.getElementById("join-name").value.trim();
        if (code.length !== 6 || !value) {
            showError(new Error("Введи шестизначный код комнаты и своё имя."));
            return;
        }

        busy = true;
        try {
            await ensureSession();
            const { data, error } = await db.rpc("join_room", {
                p_code: code,
                p_display_name: value
            });
            if (error) throw error;

            const joined = Array.isArray(data) ? data[0] : data;
            room = { id: joined.room_id, code: joined.room_code };
            displayName = value;
            saveRoom();
            await refreshRoom();
        } catch (error) {
            showError(error);
        } finally {
            busy = false;
        }
    };
}

async function refreshRoom() {
    const { data: roomData, error: roomError } = await db
        .from("rooms").select("id, code").eq("id", room.id).single();
    if (roomError) throw roomError;

    const { data: memberData, error: memberError } = await db
        .from("room_members")
        .select("user_id, display_name, joined_at")
        .eq("room_id", room.id)
        .order("joined_at");
    if (memberError) throw memberError;

    room = roomData;
    members = memberData;
    saveRoom();

    if (members.length < 2) {
        waitingScreen();
        startPolling();
    } else {
        stopPolling();
        readyScreen();
    }
}

function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
        try {
            const { data, error } = await db
                .from("room_members")
                .select("user_id, display_name, joined_at")
                .eq("room_id", room.id)
                .order("joined_at");
            if (error) throw error;
            members = data;
            if (members.length >= 2) {
                stopPolling();
                readyScreen();
            }
        } catch (error) {
            console.error(error);
        }
    }, 3000);
}

function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

function waitingScreen() {
    screen.innerHTML = `
        <section class="panel">
            <h2>Комната создана! 💗</h2>
            <p class="muted">Отправь код партнёру. Когда он подключится, экран обновится автоматически.</p>
            <div class="code">${escapeHtml(room.code)}</div>
            <button class="primary" id="share-button">Поделиться ссылкой</button>
            <div class="member">
                <div class="avatar">💗</div>
                <div><strong>${escapeHtml(displayName)}</strong><br><span class="muted">Ты в комнате</span></div>
            </div>
            <p class="muted">Ожидаем второго участника…</p>
            <button class="secondary" id="cancel-button">На главную</button>
        </section>`;
    document.getElementById("share-button").onclick = async () => {
        const url = new URL(location.href);
        url.searchParams.set("room", room.code);
        const shareData = {
            title: "Наше имя ❤️",
            text: `Присоединяйся к нашей комнате: ${room.code}`,
            url: url.href
        };

        try {
            if (navigator.share) await navigator.share(shareData);
            else {
                await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
                alert("Ссылка и код скопированы.");
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                alert(`Код комнаты: ${room.code}`);
            }
        }
    };
    document.getElementById("cancel-button").onclick = home;
}

function readyScreen() {
    screen.innerHTML = `
        <section class="panel">
            <h2>Вы вместе! ❤️</h2>
            <p class="muted">Комната ${escapeHtml(room.code)}</p>
            ${members.map((member, i) => `
                <div class="member">
                    <div class="avatar">${i === 0 ? "🧸" : "🐰"}</div>
                    <div><strong>${escapeHtml(member.display_name)}</strong><br>
                    <span class="muted">${member.user_id === sessionUser.id ? "Это ты" : "Партнёр подключился"}</span></div>
                </div>`).join("")}
            <button class="primary" id="start-button">Начать выбирать</button>
            <button class="secondary" id="results-button">Посмотреть результаты</button>
        </section>`;
    document.getElementById("start-button").onclick = chooseGender;
    document.getElementById("results-button").onclick = showResults;
}

function chooseGender() {
    screen.innerHTML = `
        <section class="panel">
            <h2>Кого выбираем?</h2>
            <p class="muted">Мужские и женские имена оцениваются отдельно.</p>
            <div class="gender-grid">
                <button class="gender-option" id="boy-option"><span class="emoji">👶🏻</span><strong>Мальчик</strong><br><small>${names.boy.length} имён</small></button>
                <button class="gender-option" id="girl-option"><span class="emoji">🎀</span><strong>Девочка</strong><br><small>${names.girl.length} имён</small></button>
            </div>
            <button class="secondary" id="back-button">Назад</button>
        </section>`;
    document.getElementById("boy-option").onclick = () => startGame("boy");
    document.getElementById("girl-option").onclick = () => startGame("girl");
    document.getElementById("back-button").onclick = readyScreen;
}

async function startGame(selectedGender) {
    gender = selectedGender;
    busy = true;
    try {
        const { data, error } = await db
            .from("votes")
            .select("name, choice")
            .eq("room_id", room.id)
            .eq("user_id", sessionUser.id)
            .eq("gender", gender);
        if (error) throw error;

        votes = Object.fromEntries(data.map(vote => [vote.name, vote.choice]));
        currentNames = names[gender].filter(name => !(name in votes));
        currentIndex = 0;
        showCard();
    } catch (error) {
        showError(error);
    } finally {
        busy = false;
    }
}

function showCard() {
    if (currentIndex >= currentNames.length) {
        screen.innerHTML = `
            <section class="panel">
                <h2>Готово! 💖</h2>
                <p class="muted">Ты оценил все имена из этого списка. Твои выборы сохранены.</p>
                <button class="primary" id="results-button">Посмотреть результаты</button>
                <button class="secondary" id="more-button">Выбрать другой список</button>
            </section>`;
        document.getElementById("results-button").onclick = showResults;
        document.getElementById("more-button").onclick = chooseGender;
        return;
    }

    const name = currentNames[currentIndex];
    const total = names[gender].length;
    const done = total - currentNames.length + currentIndex;

    screen.innerHTML = `
        <div class="muted">${gender === "boy" ? "Мужские имена" : "Женские имена"} · ${done + 1} из ${total}</div>
        <div class="progress"><div style="width:${done / total * 100}%"></div></div>
        <div class="name-stage">
            <div class="name-card" id="name-card">${escapeHtml(name)}<small>Как тебе это имя?</small></div>
        </div>
        <div class="vote-buttons">
            <button class="vote-button no" id="no-button" aria-label="Не нравится">✕</button>
            <button class="vote-button skip" id="skip-button" aria-label="Пропустить">↷</button>
            <button class="vote-button yes" id="yes-button" aria-label="Нравится">♥</button>
        </div>
        <button class="secondary" id="results-button">Мои результаты</button>`;

    document.getElementById("no-button").onclick = () => castVote(-1, "left");
    document.getElementById("skip-button").onclick = () => castVote(0, "left");
    document.getElementById("yes-button").onclick = () => castVote(1, "right");
    document.getElementById("results-button").onclick = showResults;

    enableSwipe(document.getElementById("name-card"));
}

function enableSwipe(card) {
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dragging = false;

    card.addEventListener("pointerdown", event => {
        startX = event.clientX;
        startY = event.clientY;
        dx = 0;
        dragging = true;
        card.classList.add("dragging");
        card.setPointerCapture(event.pointerId);
    });

    card.addEventListener("pointermove", event => {
        if (!dragging) return;
        dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (Math.abs(dx) > Math.abs(dy)) {
            card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
        }
    });

    const end = () => {
        if (!dragging) return;
        dragging = false;
        card.classList.remove("dragging");
        card.style.transform = "";
        if (Math.abs(dx) > 90) {
            castVote(dx > 0 ? 1 : -1, dx > 0 ? "right" : "left");
        }
        dx = 0;
    };

    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
}

async function castVote(choice, direction) {
    if (busy || currentIndex >= currentNames.length) return;
    busy = true;

    const card = document.getElementById("name-card");
    if (card) card.classList.add(direction === "right" ? "out-right" : "out-left");

    const name = currentNames[currentIndex];

    try {
        const { error } = await db.from("votes").upsert({
            room_id: room.id,
            user_id: sessionUser.id,
            name,
            gender,
            choice,
            updated_at: new Date().toISOString()
        }, { onConflict: "room_id,user_id,name,gender" });

        if (error) throw error;
        votes[name] = choice;
        currentIndex++;
        setTimeout(showCard, 180);
    } catch (error) {
        showError(error);
    } finally {
        busy = false;
    }
}

async function showResults() {
    if (busy) return;

    try {
        const { data, error } = await db
            .from("votes")
            .select("user_id, name, gender, choice")
            .eq("room_id", room.id);
        if (error) throw error;

        const allNames = names[gender];
        const genderVotes = data.filter(vote => vote.gender === gender);

        const results = allNames.map(name => {
            const mine = genderVotes.find(
                vote => vote.name === name && vote.user_id === sessionUser.id
            );
            const partner = genderVotes.find(
                vote => vote.name === name && vote.user_id !== sessionUser.id
            );
            return {
                name,
                mine: mine?.choice,
                partner: partner?.choice
            };
        }).sort((a, b) => {
            const score = item =>
                (item.mine === 1 ? 1 : 0) +
                (item.partner === 1 ? 1 : 0);

            return score(b) - score(a) ||
                allNames.indexOf(a.name) - allNames.indexOf(b.name);
        });

        const mutualCount = results.filter(
            item => item.mine === 1 && item.partner === 1
        ).length;

        const myLikes = results.filter(item => item.mine === 1).length;
        const partnerLikes = results.filter(item => item.partner === 1).length;
        const ratedCount = results.filter(
            item => item.mine !== undefined
        ).length;

        screen.innerHTML = `
            <section class="panel">
                <h2>Ваши фавориты ❤️</h2>
                <p class="muted">
                    ${gender === "boy" ? "Мужские" : "Женские"} имена ·
                    Совпадений: <strong>${mutualCount}</strong>
                </p>

                <div class="member">
                    <div class="avatar">💗</div>
                    <div>
                        <strong>${myLikes}</strong><br>
                        <span class="muted">
                            Твои лайки · оценено ${ratedCount} из ${allNames.length}
                        </span>
                    </div>
                </div>

                <div class="member">
                    <div class="avatar">💜</div>
                    <div>
                        <strong>${partnerLikes}</strong><br>
                        <span class="muted">Лайки партнёра</span>
                    </div>
                </div>

                <ul class="name-list">
                    ${results.map(item => {
                        const both = item.mine === 1 && item.partner === 1;
                        const mineOnly = item.mine === 1 && item.partner !== 1;
                        const partnerOnly = item.partner === 1 && item.mine !== 1;
                        const notRated =
                            item.mine === undefined &&
                            item.partner === undefined;

                        const label = both ? "Оба ❤️" :
                            mineOnly ? "Твой выбор" :
                            partnerOnly ? "Выбор партнёра" :
                            notRated ? "Не оценено" :
                            (item.mine === 0 || item.partner === 0)
                                ? "Пропуск"
                                : "Пока нет совпадения";

                        const badgeClass = both
                            ? "badge match"
                            : notRated
                                ? "badge pending"
                                : "badge";

                        return `
                            <li>
                                <strong>${escapeHtml(item.name)}</strong>
                                <span class="${badgeClass}">${label}</span>
                            </li>`;
                    }).join("")}
                </ul>

                <button class="primary" id="choose-button">Продолжить выбор</button>
                <button class="secondary" id="switch-gender-button">
                    Посмотреть ${gender === "boy" ? "женские" : "мужские"} имена
                </button>
                <button class="secondary" id="room-button">Вернуться в комнату</button>
            </section>`;

        document.getElementById("choose-button").onclick = chooseGender;

        document.getElementById("switch-gender-button").onclick = () => {
            gender = gender === "boy" ? "girl" : "boy";
            showResults();
        };

        document.getElementById("room-button").onclick = readyScreen;
    } catch (error) {
        showError(error);
    }
}

async function boot() {
    if (SUPABASE_URL.startsWith("ВСТАВЬ") ||
        SUPABASE_KEY.startsWith("ВСТАВЬ")) {
        screen.innerHTML = `
            <section class="panel">
                <h2>Подключим базу</h2>
                <p>В файле <code>app.js</code> замени значения SUPABASE_URL и SUPABASE_KEY на данные проекта.</p>
            </section>`;
        return;
    }

    try {
        await ensureSession();

        const saved = savedRoom();
        const queryCode = new URLSearchParams(location.search).get("room");

        if (saved?.roomId) {
            room = { id: saved.roomId, code: saved.code };
            displayName = saved.displayName;

            try {
                await refreshRoom();
                return;
            } catch {
                localStorage.removeItem(STORAGE_KEY);
                room = null;
            }
        }

        if (queryCode) {
            joinForm();
            const codeInput = document.getElementById("join-code");
            if (codeInput) codeInput.value = queryCode.toUpperCase();
        } else {
            home();
        }
    } catch (error) {
        screen.innerHTML = `
            <section class="panel">
                <h2>Не удалось подключиться</h2>
                <p class="error">${escapeHtml(error.message)}</p>
                <button class="primary" onclick="location.reload()">Повторить</button>
            </section>`;
    }
}

boot();
