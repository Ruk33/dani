function dani(config) {
    // Configurables
    const tries = config.tries || 99;
    const action_delay = config.action_delay || 650;

    // Instruction expressions
    const wait_expression = /(?<command>wait) (?<ms>(\d+))/;
    const find_expression = /(?<command>find) (?<query>([^ ]+))$/;
    const find_with_expression = /(?<command>find) (?<query>([^ ]+)) with (?<with>(.+))$/;
    const do_not_find_expression = /(?<command>dont find) (?<query>([^ ]+))$/;
    const do_not_find_with_expression = /(?<command>dont find) (?<query>([^ ]+)) with (?<with>(.+))$/;
    const click_expression = /(?<command>click) (?<query>([^ ]+))$/;
    const click_with_expression = /(?<command>click) (?<query>([^ ]+)) with (?<with>(.+))$/;
    const type_expression = /(?<command>type) \[(?<content>(.+))\] in (?<query>([^ ]+))$/;
    const type_with_expression = /(?<command>type) \[(?<content>(.+))\] in (?<query>([^ ]+)) with (?<with>(.+))$/;
    const choose_expression = /(?<command>choose) \[(?<option>(.+))\] in (?<query>([^ ]+))$/;
    const choose_with_expression = /(?<command>choose) \[(?<option>(.+))\] in (?<query>([^ ]+)) with (?<with>(.+))$/;
    const reload_expression = /(?<command>reload)$/;
    const visit_expression = /(?<command>visit) (?<href>(.+))$/;
    const goto_expression = /(?<command>goto) (?<href>(.+))$/;
    const clear_storage_expression = /(?<command>clear storage)$/;
    const clear_cookies_expression = /(?<command>clear cookies)$/;
    const resize_expression = /(?<command>resize) (?<width>(\d+)) (?<height>(\d+))$/;
    const all_expressions = [
        wait_expression,
        find_expression,
        find_with_expression,
        do_not_find_expression,
        do_not_find_with_expression,
        click_expression,
        click_with_expression,
        type_expression,
        type_with_expression,
        choose_expression,
        choose_with_expression,
        reload_expression,
        visit_expression,
        goto_expression,
        clear_storage_expression,
        clear_cookies_expression,
        resize_expression,
    ];

    // Variables
    let is_selecting_node = false;

    // DOM
    function by_id(id) {
        return document.getElementById(id);
    }

    function is_hidden(element) {
        if (!element) 
            return true;
    
        const styles = element.computedStyleMap();

        const not_displayed = styles.get("display").value === "none";
        const without_opacity = styles.get("opacity").value === 0;
        const invisible = styles.get("visibility").value === "hidden";
        
        const hidden = not_displayed || without_opacity || invisible;
        return hidden;
    }

    function is_visible(element) {
        return !is_hidden(element);
    }

    function highlight_node(element, ms) {
        if (!element)
            return;
        
        element.classList.add("dani-selector");

        if (!ms)
            return;

        setTimeout(function() {
            element.classList.remove("dani-selector");
        }, ms);
    }

    function get_node(selector, content) {
        const elements = document.querySelectorAll(selector);

        let result = undefined;

        for (const element of elements) {
            if (!content)
                result = element;
            else if (element.textContent === content)
                result = element;
            else if (element.value === content)
                result = element;

            if (result)
                break;
        }

        const highlight_time = 300;
        highlight_node(result, highlight_time);
        return result;
    }

    // DOM Actions
    function click(element) {
        element.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    function type(element, content) {
        const element_proto = element.__proto__;

        const set_value = Object.getOwnPropertyDescriptor(element_proto, "value").set;
        set_value.call(element, content);

        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function choose_option(element, option) {
        type(element, option);
    }

    // Instructions
    function get_instructions() {
        return JSON.parse(localStorage.getItem("instructions") || "[]");
    };

    function get_instruction_to_complete() {
        const instructions = get_instructions();
        return instructions.find(function(instruction) {
            return !instruction.done
        });
    }

    function record_failed_attempt() {
        const instructions = get_instructions();
        const to_complete = instructions.find(function(instruction) {
            return !instruction.done
        });

        if (!to_complete)
            return;

        const attemps_so_far = to_complete.attemps || 1;
        to_complete.attemps = attemps_so_far + 1;

        localStorage.setItem("instructions", JSON.stringify(instructions));
    }

    function out_of_attemps() {
        const instruction = get_instruction_to_complete();
        const attemps = instruction.attemps || 0;
        return attemps >= tries;
    }

    function complete_instruction() {
        const instructions = get_instructions();
        const to_complete = instructions.find(function(instruction) {
            return !instruction.done
        });

        if (!to_complete)
            return;

        to_complete.done = true;
        localStorage.setItem("instructions", JSON.stringify(instructions));
    }

    // Cookies
    function expire_cookie(cookie) {
        const now = new Date().toUTCString();
        document.cookie = cookie
            .replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + now + ";path=/");
    }

    function clear_cookies() {
        const cookies = document.cookie.split(";");
        cookies.forEach(expire_cookie);
    }

    // Helpers
    async function wait(ms) {
        return new Promise(function(resolve) {
            setTimeout(resolve, ms);
        });
    }

    // Events
    function on_complete() {
        by_id("dani-instructions").style = "display: block";
        by_id("dani-progress").style = "display: none";
        by_id("dani-error").innerText = "";
        by_id("dani-success").innerText = "All done!";
    }

    function on_progress() {
        by_id("dani-instructions").style = "display: none";
        by_id("dani-progress").style = "display: block";
        by_id("dani-error").innerText = "";
        by_id("dani-success").innerText = "Running...";

        const instructions = get_instructions();
        const progress = [];

        for (const instruction of instructions) {
            const icon = instruction.done ? "✅" : "🕰️";
            progress.push(
                "<div>" + icon + " | " + instruction.instruction + "</div>"
            );
        }

        by_id("dani-progress").innerHTML = progress.join("");
    }

    function on_error(error) {
        by_id("dani-instructions").style = "display: block";
        by_id("dani-progress").style = "display: none";
        by_id("dani-success").innerText = "";
        by_id("dani-error").innerText = error;
    }

    // Instruction handlers
    async function name_instruction() {
        complete_instruction();
    }

    async function wait_instruction() {
        const instruction = get_instruction_to_complete();
        await wait(instruction.payload.ms);
        complete_instruction();
    }

    async function click_instruction() {
        const instruction = get_instruction_to_complete();

        for (let i = 0; i < tries; i++) {
            const element = get_node(instruction.payload.query, instruction.payload.with);
            if (is_hidden(element)) {
                await wait(action_delay);
                continue;
            }

            click(element);
            complete_instruction();
            return;
        }

        throw Error("Unable to complete click instruction");
    }

    async function type_instruction() {
        const instruction = get_instruction_to_complete();

        for (let i = 0; i < tries; i++) {
            const element = get_node(instruction.payload.query, instruction.payload.with);
            if (is_hidden(element)) {
                await wait(action_delay);
                continue;
            }

            type(element, instruction.payload.content);
            
            if (element.value === instruction.payload.content) {
                complete_instruction();
                return;
            }

            if (element.textContent === instruction.payload.content) {
                complete_instruction();
                return;
            }
        }

        throw Error("Unable to complete type instruction");
    }

    async function choose_instruction() {
        const instruction = get_instruction_to_complete();

        for (let i = 0; i < tries; i++) {
            const element = get_node(instruction.payload.query, instruction.payload.with);
            if (is_hidden(element)) {
                await wait(action_delay);
                continue;
            }

            choose_option(element, instruction.payload.option);

            if (element.value === instruction.payload.option) {
                complete_instruction();
                return;
            }
        }

        throw Error("Unable to complete choose instruction");
    }

    async function find_instruction() {
        const instruction = get_instruction_to_complete();

        for (let i = 0; i < tries; i++) {
            const element = get_node(instruction.payload.query, instruction.payload.with);
            if (is_hidden(element)) {
                await wait(action_delay);
                continue;
            }

            complete_instruction();
            return;
        }

        throw Error("Unable to complete find instruction");
    }

    async function do_not_find_instruction() {
        const instruction = get_instruction_to_complete();

        for (let i = 0; i < tries; i++) {
            const element = get_node(instruction.payload.query, instruction.payload.with);
            if (is_visible(element)) {
                await wait(action_delay);
                continue;
            }

            complete_instruction();
            return;
        }

        throw Error("Unable to complete don't find instruction");
    }

    async function reload_instruction() {
        complete_instruction();
        location.reload();
    }

    async function goto_instruction() {
        const instruction = get_instruction_to_complete();

        if (out_of_attemps())
            throw Error("Unable to complete goto instruction.");

        if (window.location.pathname !== instruction.payload.href) {
            await wait(action_delay);
            record_failed_attempt();
            window.location.href = instruction.payload.href;
        }

        complete_instruction();
    }

    async function visit_instruction() {
        const instruction = get_instruction_to_complete();
        complete_instruction();
        window.location.href = instruction.payload.href;
    }

    async function clear_storage_instruction() {
        const instructions = get_instructions();

        sessionStorage.clear();
        localStorage.clear();

        localStorage.setItem("instructions", JSON.stringify(instructions));
        
        complete_instruction();

        location.reload();
    }

    async function clear_cookies_instruction() {
        clear_cookies();
        
        complete_instruction();
        
        location.reload();
    }

    async function resize_instruction() {
        const instruction = get_instruction_to_complete();
        const width = Number(instruction.payload.width);
        const height = Number(instruction.payload.height);
        resize_window(width, height);
        complete_instruction();
    }

    async function handle_instructions() {
        const to_complete = get_instruction_to_complete();

        if (!to_complete) {
            on_complete();
            return;
        }

        on_progress();

        try {
            switch (to_complete.payload.command) {
            case "wait":
                await wait_instruction();
                break;
            case "find":
                await find_instruction();
                break;
            case "dont find":
                await do_not_find_instruction();
                break;
            case "click":
                await click_instruction();
                break;
            case "type":
                await type_instruction();
                break;
            case "choose":
                await choose_instruction();
                break;
            case "reload":
                await reload_instruction();
                break;
            case "visit":
                await visit_instruction();
                break;
            case "goto":
                await goto_instruction();
                break;
            case "clear storage":
                await clear_storage_instruction();
                break;
            case "clear cookies":
                await clear_cookies_instruction();
                break;
            case "resize":
                await resize_instruction();
                break;
            default:
                throw Error("Unknown command: " + JSON.stringify(to_complete));
                break;
            }

            on_progress();
            await wait(action_delay);
            handle_instructions();
        } catch (error) {
            on_error(error.message);
        }
    }

    // Menu actions
    function play_instructions() {
        const instructions = by_id("dani-instructions")
            .value
            .split("\n")
            .filter(function(instruction) {
                return instruction.trim().length !== 0;
            })
            .map(function(instruction) {
                const clean_instruction = instruction.trim();

                let payload = {};

                for (const expression of all_expressions) {
                    const expression_matches = expression.exec(clean_instruction);
                    if (expression_matches) {
                        payload = expression_matches.groups;
                        break;
                    }
                }

                return {
                    instruction: clean_instruction,
                    payload,
                    done: false,
                };
            });

        localStorage.setItem("instructions", JSON.stringify(instructions));

        handle_instructions();
    }

    function pause_instructions() {
        const instructions = get_instructions().map(function(instruction) {
            return {
                ...instruction,
                done: true,
            };
        });
        localStorage.setItem("instructions", JSON.stringify(instructions));
        location.reload();
    }

    function restart_instructions() {
        const instructions = get_instructions().map(function(instruction) {
            return {
                ...instruction,
                done: false,
            };
        });
        localStorage.setItem("instructions", JSON.stringify(instructions));
        location.reload();
    }

    function enter_select_node_mode() {
        is_selecting_node = true;
    }

    function exit_select_node_mode(event) {
        if (!is_selecting_node)
            return;

        if (event && event.key !== "Escape")
            return;

        const all_selected = document.getElementsByClassName("dani-selector");

        for (const selected of all_selected)
            selected.classList.remove("dani-selector");

        is_selecting_node = false;
    }

    function highlight_node_on_mouse(event) {
        if (!is_selecting_node)
            return;

        const element = event.target;

        const inside_menu = by_id("dani").contains(element);
        if (inside_menu)
            return;

        exit_select_node_mode();
        enter_select_node_mode();

        highlight_node(element);
    }

    function select_node(event) {
        if (!is_selecting_node)
            return;

        const selected = document.querySelector(".dani-selector");
        if (!selected)
            return;

        const inside_menu = by_id("dani").contains(event.target);
        if (inside_menu)
            return;

        exit_select_node_mode();

        const tag = selected.tagName.toLowerCase();
        let selector = "";

        if (selected.getAttribute("id"))
            selector = tag + "[id='" + selected.getAttribute("id") + "']";
        else if (selected.getAttribute("placeholder"))
            selector = tag + "[placeholder='" + selected.getAttribute("placeholder") + "']";
        else if (selected.textContent)
            selector = tag + " with " + selected.textContent;
        else if (selected.value)
            selector = tag + " with " + selected.value;

        const instructions_text = by_id("dani-instructions")
        instructions_text.value = (instructions_text.value.trim() + "\n" + selector).trim();
    }

    function open_documentation() {

    }

    function save_instructions() {
        const instructions = by_id("dani-instructions").value;
        localStorage.setItem("instructions_draft", instructions);
    }

    function restore_instructions() {
        const instructions = localStorage.getItem("instructions_draft") || "";
        by_id("dani-instructions").value = instructions;
    }

    function toggle_menu() {
        by_id("dani").classList.toggle("dani-hide");
    }

    // Initialize
    function initialize() {
        const menu = document.createElement("div");

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
            <div id="dani">
                <div class="dani-content">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 10px;">
                        <button id="dani-toggle-menu" class="dani-button" type="button">🤏</button>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                            <button class="dani-button" type="button" id="dani-play">▶️</button>
                            <button class="dani-button" type="button" id="dani-pause">⏸️</button>
                            <!--<button class="dani-button" type="button" id="dani-restart">🔄</button>-->
                            <button class="dani-button" type="button" id="dani-select-node">🎯</button>
                            <!--<button class="dani-button" type="button" id="dani-documentation">📘</button>-->
                        </div>
                    </div>
                    <div id="dani-error" style="color: red; width: 500px; font-family: consolas; font-size: 14px; padding: 5px;"></div>
                    <div id="dani-success" style="color: #6bc73e; width: 500px; font-family: consolas; font-size: 14px; padding: 5px;"></div>
                    <textarea id="dani-instructions" class="dani-instructions" placeholder="Enter commands."></textarea>
                    <div id="dani-progress" style="display: none;" class="dani-instructions"></div>
                </div>
            </div>
        `;

        document.body.append(menu);

        by_id("dani-toggle-menu").addEventListener("click", toggle_menu);
        by_id("dani-play").addEventListener("click", play_instructions);
        by_id("dani-pause").addEventListener("click", pause_instructions);
        // by_id("dani-restart").addEventListener("click", restart_instructions);
        by_id("dani-select-node").addEventListener("click", enter_select_node_mode);
        // by_id("dani-documentation").addEventListener("click", open_documentation);
        by_id("dani-instructions").addEventListener("input", save_instructions);

        document.addEventListener("mousemove", highlight_node_on_mouse);
        document.addEventListener("mousedown", select_node);
        document.addEventListener("keyup", exit_select_node_mode);

        restore_instructions();
        handle_instructions();
    }

    window.addEventListener("load", initialize);
}

dani({});
