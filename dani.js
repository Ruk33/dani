// How many times to re-try certain actions before giving up and failing.
const default_tries = Number(localStorage.getItem("defaultTries")) || 15;
// How many ms to wait between each action.
const wait_before_each_action = Number(localStorage.getItem("waitBeforeEachAction")) || 650;

const by_id = (id) => document.getElementById(id);

const get_instructions = () => JSON.parse(localStorage.getItem("instructions") || "[]");

const extract_selector = (from) => {
    const selector =
        /\s(?<selector>(([.#])?[a-z0-9_-]*(\:[a-z0-9_-]+(\(.*?\))?|\[.*?\])?\>?)+)((\swith\s(?<with>(.+)))?)/i;
    const result = selector.exec(from);
    return {
        selector: (result.groups?.selector || "").trim(),
        with: result.groups?.with,
    };
};

const parse_type_in = (instruction) => {
    const selector =
        /(type|choose)\s\[(?<to_type>(.*?))\](\sin\s(?<selector>(([.#])?[a-z0-9_-]*(\:[a-z0-9_-]+(\(.*?\))?|\[.*?\])?\>?)+)((\swith\s(?<with>(.+)))?))?/i;
    const result = selector.exec(instruction);
    return {
        to_type: result?.groups?.to_type || "",
        selector: (result?.groups?.selector || "").trim(),
        with: result?.groups?.with,
    };
};

const clear_cookies = () => {
    const now = new Date().toUTCString();
    const cookies = document.cookie.split(";");
    const expire = (cookie) => document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, "=;expires=" + now + ";path=/");
    cookies.forEach(expire);
};

const is_element_hidden = (element) => {
    if (!element) 
        return true;
    
    const styles = element.computedStyleMap();

    const notDisplayed = styles.get("display").value === "none";
    const withoutOpacity = styles.get("opacity").value === 0;
    const invisible = styles.get("visibility").value === "hidden";
    
    const hidden = notDisplayed || withoutOpacity || invisible;
    return hidden;
};

const get_selector = (element) => {
    if (element.id)
        return {
            selector: `[id="${element.id}"]`,
            with: undefined,
            fullSelector: `[id="${element.id}"]`,
        };

    return {
        selector: "",
        with: undefined,
        fullSelector: "",
    };
};

const find_selector_for = (element) => {
    return get_selector(element);
};

const find_child_with_text = (from, text) => {
    if (!from) return undefined;

    const children = from.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.textContent.trim() !== text)
            continue;
        return find_child_with_text(child, text);
    }

    return from;
}

const find_element = (query, content, find_all) => {
    if (!query)
        return;

    const elements = document.querySelectorAll(query);
    const result = [];
    for (let i = 0; i < elements.length; i++) {
        let element = elements[i];
        if (element) {
            if (content !== undefined) {
                let matches = false;
                if (element.textContent && element.textContent.trim() === content) {
                    element = find_child_with_text(element, content);
                    matches = true;
                }
                if (element.value && element.value === content) 
                    matches = true;
                if (element.placeholder && element.placeholder === content)
                    matches = true;
                if (!matches) 
                    continue;
            }
            if (!find_all) {
                // scroll to node
                element.scrollIntoView(true);
                // highlight
                const bg = element.style.background;
                element.style.background = "#cedfff";
                // remove highlight after a few ms
                setTimeout(() => {
                    element.style.background = bg;
                }, 500);
            }

            if (!find_all)
                return element;

            result.push(element);
        }
    }
    if (find_all) 
        return result;
};

const type_in = (input, what, tries) => {
    const prev_value = input.value;
    if (input.getAttribute("contentEditable") === "true") {
        input.textContent = what;
        complete_instruction();
        setTimeout(() => handle_instruction(default_tries), wait_before_each_action);
        return;
    }
    const set_value = Object.getOwnPropertyDescriptor(input.__proto__, "value").set;
    set_value.call(input, what);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // if the value wasn't successfully updated, go back
    // to the previous value. this can happen with select
    // inputs, if the option isn't valid, the select won't be
    // correctly updated.
    if (input.value !== what) {
        set_value.call(input, prev_value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        setTimeout(() => handle_instruction(tries - 1), 500);
        return;
    }
    complete_instruction();
    setTimeout(() => handle_instruction(default_tries), wait_before_each_action);
};

const update_logs = () => {
    const instructions = get_instructions();
    const next = instructions.find((instruction) => !instruction.done);

    const log = by_id("instructions");
    log.value = "";
    const resize_operation = instructions.find((instruction) =>
        instruction.instruction.startsWith("resize "),
    );
    for (let i = 0; i < instructions.length; i++) {
        if (!window.opener && resize_operation)
            log.value += `${instructions[i].instruction}\n`;
        else if (instructions[i] === next)
            log.value += `🛠️ ${instructions[i].instruction}\n`;
        else if (instructions[i].done)
            log.value += ``;
        else log.value += `😴 ${instructions[i].instruction}\n`;
    }

    by_id("success").textContent = "";
    by_id("error").textContent = "";

    if (!next) {
        by_id("success").textContent = "All done!";
        log.value = "";
        for (let i = 0; i < instructions.length; i++) {
            log.value += `${instructions[i].instruction}\n`;
        }
        localStorage.removeItem("instructions");
        return;
    }
};

const complete_instruction = () => {
    const instructions = get_instructions();
    const next = instructions.find((instruction) => !instruction.done);
    if (!next)
        return;
    console.log(`${next.instruction} done`);
    next.done = true;
    localStorage.setItem("instructions", JSON.stringify(instructions));
    update_logs();
};

const complete_intervention = () => {
    complete_instruction();
    by_id("play").removeEventListener("click", complete_intervention);
    by_id("play").addEventListener("click", (e) => {
        e.stopPropagation();
        handle_play();
    });
    hide_menu();
    setTimeout(() => handle_instruction(default_tries), wait_before_each_action);
};

const test_all = async () => {
    const response = await fetch("/api/qa/test");
    const tests = await response.json();
    const instructions = tests.instructions;
    by_id("instructions").value = instructions;
    handle_play();
};

const handle_instruction = (tries) => {
    const instructions = get_instructions();
    const next = instructions.find((instruction) => !instruction.done);

    // No more instructions to run, just replace the 
    // textarea with whatever the user typed before
    // running all the actions.
    if (!next) {
        by_id("instructions").value = localStorage.getItem("instructions_draft") || "" + "\n";
        return;
    }

    // Out of tries, report error.
    if (!tries) {
        let name = "";
        const next_index = instructions.findIndex((instruction) => !instruction.done);
        let name_index = 0;
        for (let i = next_index; i >= 0; i--) {
            if (!instructions[i].instruction.startsWith("name "))
                continue;
            name_index = i;
            const full_name = instructions[i].instruction.split(" ")[1];
            const line = next_index - name_index;
            name = `Error in <a href="vscode://file/${full_name}:${line}">${full_name}</a> line ${line}`;
            break;
        }
        by_id("error").innerHTML = `Unable to complete: ${next.instruction}. ${name}`;
        localStorage.removeItem("instructions");

        const log = by_id("instructions");
        log.value = "";
        for (let i = 0; i < instructions.length; i++) {
            log.value += `${instructions[i].instruction}\n`;
        }
        return;
    }

    const params = next.instruction.split(" ");
    const command = params[0];

    // Ignore comments.
    if (command.startsWith("//")) {
        complete_instruction();
        handle_instruction(default_tries);
        return;
    }

    switch (command) {
        case "test": {
            test_all();
        }
        break;
        case "name": {
            complete_instruction();
            handle_instruction(default_tries);
        }
        break;
        case "wait": {
            setTimeout(() => {
                complete_instruction();
                handle_instruction(default_tries);
            }, Number(params[1]));
        }
        break;
        case "click": {
            const query = extract_selector(next.instruction);
            const element = find_element(query.selector, query.with);
            if (!element) {
                setTimeout(() => handle_instruction(tries - 1), 500);
                return;
            }

            element.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
            element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
            element.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
            element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
            element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

            complete_instruction();
            setTimeout(() => handle_instruction(default_tries), wait_before_each_action);
        }
        break;
        case "type":
        case "choose": {
            const query = parse_type_in(next.instruction);

            // Try to see if we can type in the active element, meaning
            // the current focused element.
            if (!query.selector) {
                const active_element = document.activeElement;
                switch (active_element.tagName) {
                case "INPUT":
                case "SELECT":
                    type_in(active_element, query.to_type, tries);
                    return;
                }
            }

            const element = find_element(query.selector, query.with);
            if (!element || element.disabled) {
                setTimeout(() => {
                    handle_instruction(tries - 1);
                }, 500);
                return;
            }
            type_in(element, query.to_type, tries);
        }
        break;
        case "don't":
        case "dont":
        case "find": {
            const query = extract_selector(next.instruction);
            const element = find_element(query.selector, query.with);
            // don't find element.
            if (command !== "find" && !is_element_hidden(element)) {
                setTimeout(() => handle_instruction(tries - 1), 500);
                return;
            }
            // don't find element.
            if (command !== "find" && is_element_hidden(element)) {
                complete_instruction();
                setTimeout(() => handle_instruction(default_tries), wait_before_each_action);
                return;
            }

            // find element.
            if (is_element_hidden(element)) {
                setTimeout(() => handle_instruction(tries - 1), 500);
                return;
            }
            complete_instruction();
            setTimeout(() => handle_instruction(default_tries), wait_before_each_action);
        }
        break;
        case "reload": {
            complete_instruction();
            location.reload();
        }
        break;
        case "goto": {
            if (window.location.pathname === params[1]) {
                complete_instruction();
                setTimeout(() => handle_instruction(default_tries), wait_before_each_action);
                return;
            }
            window.location.href = params[1];
        }
        break;
        case "visit": {
            complete_instruction();
            window.location.href = params[1];
        }
        break;
        case "intervention": {
            by_id("error").innerHTML =
                `<p>User intervention requested:</p><p>${next.instruction.replace("intervention ", "")}.</p><p>Once YOU finished the action, click ▶️ to continue.</p>`;
            show_menu();
            document
                .getElementById("play")
                .removeEventListener("click", handle_play);
            document
                .getElementById("play")
                .addEventListener("click", complete_intervention);
        }
        break;
        case "clear": {
            const what = params[1];
            switch (what) {
                case "storage": {
                    const instructions = JSON.parse(
                        localStorage.getItem("instructions") || "[]",
                    );
                    const instructions_draft = localStorage.getItem("instructions_draft");
                    sessionStorage.clear();
                    localStorage.clear();
                    localStorage.setItem(
                        "instructions",
                        JSON.stringify(instructions),
                    );
                    localStorage.setItem("instructions_draft", instructions_draft);
                    complete_instruction();
                    location.reload();
                }
                break;
                case "cookies": {
                    clear_cookies();
                    complete_instruction();
                    location.reload();
                }
                break;
                case "all": {
                    const instructions = get_instructions();
                    const instructions_draft = localStorage.getItem("instructions_draft");
                    sessionStorage.clear();
                    localStorage.clear();
                    clear_cookies();
                    localStorage.setItem("instructions", JSON.stringify(instructions));
                    localStorage.setItem("instructions_draft", instructions_draft);
                    complete_instruction();
                    location.reload();
                }
                break;
                default: {
                    alert("clear needs to be 'storage', 'cookies' or 'all'");
                }
                break;
            }
        }
        break;
        case "resize": {
            const width = params[1];
            const height = params[2];
            resizeTo(Number(width), Number(height));
            complete_instruction();
            setTimeout(() => handle_instruction(default_tries), wait_before_each_action);
        }
        break;
        default: {
            alert(`command ${command} not found`);
        }
        break;
    }
};

const handle_play = () => {
    const raw_instructions = by_id("instructions").value;

    const instructions = raw_instructions
        .split("\n")
        .map((instruction) => instruction.trim())
        .filter((instruction) => instruction.length > 0)
        // .filter((instruction) => !instruction.startsWith("//"))
        .map((instruction) => ({
            instruction: instruction
                .replace("🛠️ ", "")
                .replace("✅ ", "")
                .replace("😴 ", ""),
            done: false,
        }));
    localStorage.setItem("instructions", JSON.stringify(instructions));

    const resize_operation = instructions.find((instruction) =>
        instruction.instruction.startsWith("resize "),
    );
    if (!window.opener && resize_operation) {
        window.open(document.location.href, "", "left=0,top=0");
        return;
    }

    update_logs();
    handle_instruction(default_tries);

    hide_menu();
};

const handle_pause = () => {
    const instructions = 
        JSON.parse(localStorage.getItem("instructions") || "[]")
        .map((instruction) => ({ ...instruction, done: true }));
    localStorage.setItem("instructions", JSON.stringify(instructions));
    update_logs();
    by_id("success").textContent = "Paused";
};

const handle_restart = () => {
    const instructions = get_instructions();
    const all_restarted = instructions.map((instruction) => ({
        ...instruction,
        done: false,
    }));
    localStorage.setItem("instructions", JSON.stringify(all_restarted));
    location.reload();
};

const open_documentation = () => {
    by_id("documentation-dialog").showModal();
};

const highlight_node_with_mouse = (e) => {
    const selector_is_not_enabled = !by_id("dani").classList.contains("dani-selector-enabled");
    if (selector_is_not_enabled)
        return;
    
    const target_has_no_id = !e.target.id;
    if (target_has_no_id)
        return;

    const all_selected = document.getElementsByClassName("dani-selector");
    for (const selected of all_selected)
        selected.classList.remove("dani-selector");
    
    e.target.classList.add("dani-selector");

    // If the node is disabled, no mouseup event will be trigger
    // This is a hacky approach to the problem but seems to work...
    if (e.target.disabled) {
        const record_and_collect = (e) => {
            record_action(e);
            e.target.disabled = true;
            e.target.removeEventListener("mouseup", record_and_collect);
            e.target.removeEventListener("mouseleave", cleanup);
        }

        const cleanup = () => {
            e.target.disabled = true;
            e.target.removeEventListener("mouseup", record_and_collect);
            e.target.removeEventListener("mouseleave", cleanup);
        }

        e.target.disabled = false;
        e.target.addEventListener("mouseup", record_and_collect);
        e.target.addEventListener("mouseleave", cleanup);
    }
};

const record_action = (e) => {
    if (!by_id("dani").classList.contains("dani-selector-enabled"))
        return;
    
    const selected = document.querySelector(".dani-selector");
    if (!selected) {
        exit_select_node_mode();
        return;
    }

    e.preventDefault();
    e.stopPropagation();
    
    const result = find_selector_for(selected);
    by_id("error").textContent = "";
    by_id("success").textContent = "Action added to the list of actions.";

    switch (selected.tagName) {
    case "BUTTON":
        by_id("instructions").value += `\nclick ${result.fullSelector}\n`;
        break;
    case "INPUT":
        by_id("instructions").value += `\ntype [text] in ${result.fullSelector}\n`;
        break;
    case "SELECT":
        by_id("instructions").value += `\nchoose [option] in ${result.fullSelector}\n`;
        break;
    case "A":
        by_id("instructions").value += `\nclick ${result.fullSelector}\n`;
        break;
    case "LABEL":
        by_id("instructions").value += `\nclick ${result.fullSelector}\n`;
        break;
    default:
        by_id("instructions").value += `\nfind ${result.fullSelector}\n`;
        break;
    }
    by_id("instructions").value = by_id("instructions").value.trim() + "\n";
    localStorage.setItem("instructions_draft", by_id("instructions").value);

    exit_select_node_mode();
};

const save_instructions = (e) => {
    const content = e.target.value;
    const is_running =
        content.includes("🛠️") ||
        content.includes("✅") ||
        content.includes("😴");
    if (is_running)
        return;
    localStorage.setItem("instructions_draft", content);
}

const toggle_menu_visibility = () => {
    by_id("dani").classList.toggle("dani-hide");
}

const show_menu = () => {
    by_id("dani").classList.remove("dani-hide");
}

const hide_menu = () => {
    by_id("dani").classList.add("dani-hide");
}

const enable_select_node_mode = () => {
    toggle_menu_visibility();
    by_id("dani").classList.add("dani-selector-enabled");
}

const exit_select_node_mode = () => {
    toggle_menu_visibility();
    by_id("dani").classList.remove("dani-selector-enabled");
    const selected = document.getElementsByClassName("dani-selector");
    for (const element of selected)
        element.classList.remove("dani-selector");
}

const create_menu = () => {
    const menu = document.createElement("div");
    menu.id = "dani";
    menu.innerHTML = `
    <style>
    #dani {
        transition: all 200ms; 
        position: fixed;
        height: calc(100vh - 40px);
        top: 0; 
        right: 0;
        margin: 10px;
        background-color: white; 
        z-index: 999; 
        pointer-events: all;
    }
    .dani-content {
        display: flex; 
        flex-direction: column; 
        height: 100%;
        padding: 10px;
        box-shadow: 0 15px 70px 5px rgba(38,27,35,0.15), 0 1px 1px rgba(38,27,35,0.04);
        border-radius: 10px;
        border: 1px solid #ebeae8;
    }
    .dani-button {
        border: 0;
        padding: 4px;
        border-radius: 2px;
        background-color: rgba(38,27,35,0.05);
        cursor: pointer;
    }
    .dani-selector {
        transition: all 200ms; 
        background-color: #cedfff !important;
    }
    .dani-hide {
        transform: translateX(490px);
    }
    .dani-instructions {
        outline: none;
        flex: 1;
        width: 500px;
        padding: 10px;
        font-size: 14px;
        line-height: 28px;
        font-family: consolas;
        border: 1px dashed #eeedee; border-radius: 5px;
        color: #5c5c5b;
    }
    </style>
    <dialog id="documentation-dialog">
        <pre>
wait (ms)
        Blocks and waits ms.
        Example: wait 2000

click (node-id)
        Click element found using node id.
        Example: click [id="some-id"]

click (node-id) with (text content)
        Click element found using node id and checking for it's content/value.
        Example: click [id="some-id"] with Checkout
        Example: click [id="some-id"] with 42

type ([what]) in (node-id)
choose ([what]) in (node-id)
        Types text in element found using node id.
        Choose is just an alias. It's mean to be used for select inputs (for instance, the quantity selector in the cart slider)
        Example: type [42] in [id="some-id"]
        Example: choose [2] in [id="some-id"]

find (node-id)
        Finds and ensures element with id exists.
        Example: find [id="some-id"]

find (node-id) with (text content)
        Finds element with id ensuring it's content/value matches.
        Example: find [id="some-id"] with this text
        Example: find [id="some-id"] with 42

don't find (node-id)
don't find (node-id) with (text content)
        Make sure an element isn't found or visible.
        Example: don't find [id="some-id"] with Some content
        Example: don't find [id="some-id"]

reload
        Reloads page.
        Example: reload

resize width height
        Resize window to the specified dimensions
        Example: resize 800 600

visit (url)
        Visits url/uri without doing any checks. This is useful for URLS having redirects, where we don't really care what URL we end up in, we just want to visit the URL.
        Example: visit /products

goto (url)
        Similar to visit, but it will only complete the instruction if the URL matches url.
        Example: goto /products
        If, after running goto /products, the URL doesn't match "/products" the tool will try again.

clear (storage|cookies|all)
        Clears storage, cookies, or both and reloads the page.
        Example: clear cookies
        Example: clear all

intervention (helpful message)
        Blocks and waits for user to intervene.
        Example: intervention upload file for product
        </pre>
        <form method="dialog" style="position: absolute; top: 10px; right: 10px;">
            <button style="border: 0; background-color: transparent;">❌</button>
        </form>
    </dialog>

    <div class="dani-content">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 10px;">
            <button id="toggle-dani-menu" class="dani-button" type="button">🤏</button>
            <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                <button class="dani-button" type="button" id="play">▶️</button>
                <button class="dani-button" type="button" id="pause">⏸️</button>
                <button class="dani-button" type="button" id="restart">🔄</button>
                <button class="dani-button" type="button" id="select-node">🎯</button>
                <button class="dani-button" type="button" id="documentation">📘</button>
            </div>
        </div>
        <div id="error" style="color: red; width: 500px; font-family: consolas; font-size: 14px; padding: 5px;"></div>
        <div id="success" style="color: #6bc73e; width: 500px; font-family: consolas; font-size: 14px; padding: 5px;"></div>
        <textarea id="instructions" class="dani-instructions" placeholder="Enter commands."></textarea>
    </div>`;
    
    document.body.append(menu);

    by_id("toggle-dani-menu").addEventListener("click", (e) => {
        e.stopPropagation();
        toggle_menu_visibility()
    });
    by_id("play").addEventListener("click", (e) => {
        e.stopPropagation();
        handle_play();
    });
    by_id("pause").addEventListener("click", (e) => {
        e.stopPropagation();
        handle_pause();
    });
    by_id("restart").addEventListener("click", (e) => {
        e.stopPropagation();
        handle_restart();
    });
    by_id("documentation").addEventListener("click", (e) => {
        e.stopPropagation();
        open_documentation();
    });
    by_id("select-node").addEventListener("click", (e) => {
        e.stopPropagation();
        enable_select_node_mode();
    });
    by_id("instructions").addEventListener("input", (e) => {
        e.stopPropagation();
        save_instructions(e);
    });
    by_id("instructions").addEventListener("mousedown", (e) => e.stopPropagation());
    by_id("instructions").addEventListener("mouseup", (e) => e.stopPropagation());
    by_id("instructions").addEventListener("click", (e) => e.stopPropagation());
    by_id("instructions").addEventListener("keydown", (e) => e.stopPropagation());
    by_id("instructions").addEventListener("keyup", (e) => e.stopPropagation());
    by_id("instructions").addEventListener("keypress", (e) => e.stopPropagation());

    document.addEventListener("keyup", (e) => {
        if (e.key !== "Escape") return;
        if (!by_id("dani").classList.contains("dani-selector-enabled")) return;
        e.stopPropagation();
        exit_select_node_mode();
    });
    document.addEventListener("mousemove", highlight_node_with_mouse);
    document.addEventListener("mouseup", record_action);
};

const run_pending_commands = () => {
    update_logs();
    const instructions = get_instructions();
    const resize_operation = instructions.find((instruction) => instruction.instruction.startsWith("resize "));
    if (!window.opener && resize_operation)
        return;
    setTimeout(() => handle_instruction(default_tries), wait_before_each_action);
};

window.addEventListener("load", () => {
    create_menu();
    run_pending_commands();
    toggle_menu_visibility();
});
