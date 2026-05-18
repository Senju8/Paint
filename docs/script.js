// ビュー
const view = document.querySelector("#view");
const vctx = view.getContext("2d", { desynchronized: true });
let requiresRedrawing = true;
let drawingLoopId = null;

// 背景
const background = new OffscreenCanvas(0, 0);
const bctx = background.getContext("2d");

// キャンバス
const canvas = new OffscreenCanvas(0, 0);
const cctx = canvas.getContext("2d", { willReadFrequently: true });
let cnvX = 0, cnvY = 0, cnvOfsX = 0, cnvOfsY = 0, cnvAngle = 0, cnvScale = 1;
let cnvXAxisX = 0, cnvXAxisY = 0, cnvYAxisX = 0, cnvYAxisY = 0;
let cnvScaleExp = 0, cnvScaleMinExp = -6, cnvScaleMaxExp = 6;

// プレビュー
const preview = new OffscreenCanvas(0, 0);
const pctx = preview.getContext("2d");

// 下書き
const draft = new OffscreenCanvas(0, 0);
const dctx = draft.getContext("2d");
let draftStyle = "black";

// ストローク
class Stroke {
    static #canvas = new OffscreenCanvas(0, 0);
    static #context = Stroke.#canvas.getContext("2d");
    static #registry = new Map();
    static #instance = null; // バインドされたストロークインスタンス

    type; // "stroke", "eraser"
    cap; // "none", "rectangle", "ellipse"
    width;
    height;
    ofsX;
    ofsY;
    style; // Nullable
    image; // ImageBitmap, Nullable

    constructor(type = "stroke", cap = "rectangle", width = 1, height = 1, style = null) {
        this.type = type;
        this.cap = cap;
        this.width = width;
        this.height = height;
        this.ofsX = -width / 2;
        this.ofsY = -height / 2;
        this.style = style;
    }

    static bind(id = "unknown") { Stroke.#instance = Stroke.registry.get(id); }

    static validate(instance = null) { return instance instanceof Stroke && instance.image instanceof ImageBitmap; }

    static get registry() { return Stroke.#registry; }

    static get instance() { return Stroke.#instance; }

    // generator: null or Function (context, canvas) => {}
    generate(generator = null) {
        Stroke.#canvas.width = this.width;
        Stroke.#canvas.height = this.height;

        Stroke.#context.clearRect(0, 0, Stroke.#canvas.width, Stroke.#canvas.height);
        Stroke.#context.beginPath();
        Stroke.#context.fillStyle = "black";

        switch (this.cap) {
            case "rectangle":
                Stroke.#context.fillRect(0, 0, Stroke.#canvas.width, Stroke.#canvas.height);
                break;
            case "ellipse":
                break;
        }

        if (generator instanceof Function) {
            generator(Stroke.#context, Stroke.#canvas);
        }

        this.image = Stroke.#canvas.transferToImageBitmap();

        return this;
    }
}

// ツール
let toolType = "stroke"; // "none", "stroke", "eraser", "shape"
let toolStyle = "black";

// グリッド
let gridWidth = 0, gridHeight = 0;

// タスクループ
let taskLoopId = null;

// 入力
const pointers = new Map();
const buttons = new Set();
const keys = new Map();
let mainPointerId = null;
let subPointerId = null;
let mainKeyId = null;
let trajectories = []; // メインポインターの軌跡
let twX0 = 0, twY0 = 0, twX = 0, twY = 0;
let twExpB = 0, twDst0 = 0, twDst = 0, twExpPlay = Math.log2(1.25);
let twAglB = 0, twAgl0 = 0, twAgl = 0, twRotPlay = 10;

let restrictionLevel = 0; // あらゆる操作の禁止レベル

// DOM
const fadeIn = { opacity: [0, 1, 1], offset: [0, 0.25, 1] };
const fadeOut = { opacity: [1, 1, 0], offset: [0, 0.75, 1] };
const fadeInOut = { opacity: [0, 1, 1, 0], offset: [0, 0.1, 0.9, 1] };

const toolStroke = document.getElementById("tool-stroke");
const toolEraser = document.getElementById("tool-eraser");
const toolColor = document.getElementById("tool-color");

const announcement = document.getElementById("announcement");

// ビューの描画
const drawView = () => {
    if (canvas.width <= 0 || canvas.height <= 0)
        return;
    if (!requiresRedrawing)
        return;

    vctx.imageSmoothingEnabled = false;
    vctx.clearRect(0, 0, view.width, view.height);
    vctx.beginPath();

    // キャンバスの描画
    vctx.translate(cnvX, cnvY);
    vctx.rotate(cnvAngle * TO_RADS);
    vctx.scale(cnvScale, cnvScale);
    vctx.translate(cnvOfsX, cnvOfsY);
    vctx.drawImage(background, 0, 0);
    vctx.drawImage(canvas, 0, 0);
    vctx.drawImage(preview, 0, 0);
    vctx.resetTransform();

    // グリッドの描画
    vctx.globalCompositeOperation = "difference";
    vctx.strokeStyle = "gray";
    vctx.globalAlpha = 0.25;
    vctx.translate(cnvX, cnvY);
    vctx.rotate(cnvAngle * TO_RADS);
    vctx.translate(cnvOfsX * cnvScale, cnvOfsY * cnvScale);
    vctx.beginPath();

    for (let i = 0; i <= gridHeight; ++i) {
        vctx.moveTo(0, i * 64);
        vctx.lineTo(gridWidth * 64, i * 64);
    }

    for (let i = 0; i <= gridWidth; ++i) {
        vctx.moveTo(i * 64, 0);
        vctx.lineTo(i * 64, gridHeight * 64);
    }

    vctx.stroke();
    vctx.resetTransform();
    vctx.globalAlpha = 1;
    vctx.globalCompositeOperation = "source-over";

    // フレームの描画
    vctx.strokeStyle = "white";
    vctx.translate(cnvX, cnvY);
    vctx.rotate(cnvAngle * TO_RADS);
    vctx.translate(cnvOfsX * cnvScale, cnvOfsY * cnvScale);
    vctx.beginPath();
    vctx.rect(0, 0, canvas.width * cnvScale, canvas.height * cnvScale);
    vctx.stroke();
    vctx.resetTransform();

    // 十字の描画
    vctx.translate(view.width / 2, view.height / 2);
    vctx.globalCompositeOperation = "exclusion";
    vctx.globalAlpha = 0.25;
    vctx.strokeStyle = "white"
    vctx.beginPath();
    vctx.moveTo(0, -8);
    vctx.lineTo(0, 8);
    vctx.moveTo(-8, 0);
    vctx.lineTo(8, 0);
    vctx.stroke();
    vctx.globalAlpha = 1;
    vctx.globalCompositeOperation = "source-over";
    vctx.resetTransform();

    requiresRedrawing = false;
};

// 描画の開始
const startDrawing = (fps = 30) => {
    if (drawingLoopId) {
        clearInterval(drawingLoopId);
    }

    drawingLoopId = setInterval(drawView, 1000 / fps);
};

// 再描画の要求
const redraw = () => {
    requiresRedrawing = true;
};

// ビューの更新
const resizeView = () => {
    view.width = innerWidth;
    view.height = innerHeight;
    centerCanvas();
    redraw();
};

// 背景の更新
const updateBackground = (style = null) => {
    const exp = 3 + Math.max(0, -Math.floor(cnvScaleExp));
    const size = 1 << exp;

    bctx.fillStyle = "white";
    bctx.fillRect(0, 0, background.width, background.height);

    bctx.fillStyle = "rgb(240 240 240)";
    for (let j = 0; j < background.height; j += size) {
        for (let i = 0; i < background.width; i += size) {
            if (((i + j) >> exp & 1) === 0) {
                bctx.fillRect(i, j, size, size);
            }
        }
    }

    if (style) {
        bctx.fillStyle = style;
        bctx.fillRect(0, 0, background.width, background.height);
    }
};

// ビュー座標をキャンバス座標に変換
const projectOnToCanvas = (position = []) => {
    const projected = [];
    const length = position.length - 1;
    const cnvHW = canvas.width / 2;
    const cnvHH = canvas.height / 2;
    let dltX, dltY;

    for (let i = 0; i < length; i += 2) {
        dltX = position[i] - cnvX;
        dltY = position[i + 1] - cnvY;

        projected.push(
            cnvHW + (cnvXAxisX * dltX + cnvXAxisY * dltY) / cnvScale,
            cnvHH + (cnvYAxisX * dltX + cnvYAxisY * dltY) / cnvScale
        );
    }

    return projected;
};

// キャンバスの座標軸を計算
const computeCanvasAxis = () => {
    cnvXAxisX = Math.cos(cnvAngle * TO_RADS);
    cnvXAxisY = Math.sin(cnvAngle * TO_RADS);
    cnvYAxisX = Math.cos((cnvAngle + 90) * TO_RADS);
    cnvYAxisY = Math.sin((cnvAngle + 90) * TO_RADS);
};

// キャンバスの変形
const locateCanvas = (x = 0, y = 0, announcement = false) => {
    cnvX = x;
    cnvY = y;

    if (announcement) {
        const position = projectOnToCanvas([view.width / 2, view.height / 2]);
        announce(`Position: (x, y) = (${Math.round(position[0])}, ${Math.round(position[1])})`);
    }

    redraw();
};

const centerCanvas = (announcement = false) => {
    locateCanvas(view.width / 2, view.height / 2, announcement);
}

const translateCanvas = (dltX = 0, dltY = 0, announcement = false) => {
    locateCanvas(cnvX + dltX, cnvY + dltY, announcement);
};

const moveCanvas = (angle = 0, dltMvt = 0, announcement = false) => {
    angle *= TO_RADS;
    translateCanvas(Math.cos(angle) * dltMvt, Math.sin(angle) * dltMvt, announcement);
};

const angleCanvas = (angle = 0, announcement = false) => {
    cnvAngle = angle % 360;

    if (announcement)
        announce(`Angle: ${Math.round(cnvAngle)}°`);

    computeCanvasAxis();
    redraw();
};

const rotateCanvas = (dltAngle = 0, announcement = false) => angleCanvas(cnvAngle + dltAngle, announcement);

const scaleCanvas = (scale = 1, announcement = false) => {
    cnvScale = scale;

    if (announcement)
        announce(`Scale: ${Math.round(cnvScale * 100)}%`);

    updateBackground();
    updateGrid();
    redraw();
};

const zoomCanvas = (x = cnvX, y = cnvY, scaleExp = 0, announcement = false) => {
    const dltX = cnvX - x;
    const dltY = cnvY - y;
    let dltScale = 0;
    let oldCnvScale = cnvScale;

    scaleCanvas(2 ** scaleExp, announcement);
    dltScale = cnvScale / oldCnvScale;
    translateCanvas(dltX * dltScale - dltX, dltY * dltScale - dltY);
}

const stretchCanvas = (x = cnvX, y = cnvY, dltExp = 0, announcement = false) => {
    cnvScaleExp += dltExp;
    cnvScaleExp = Math.max(cnvScaleMinExp, Math.min(cnvScaleExp, cnvScaleMaxExp));
    zoomCanvas(x, y, Math.floor(cnvScaleExp), announcement);
}

const resizeCanvas = (width = 0, height = 0) => {
    if (setRestrictionLevel(20))
        return;

    background.width = width;
    background.height = height;
    canvas.width = background.width;
    canvas.height = background.height;
    preview.width = canvas.width;
    preview.height = canvas.height;
    draft.width = preview.width;
    draft.height = preview.height;
    cnvOfsX = -canvas.width / 2;
    cnvOfsY = -canvas.height / 2;
    updateBackground();
    updateGrid();
    redraw();
};

// プレビューのクリア
const clearPreview = () => {
    pctx.clearRect(0, 0, preview.width, preview.height);
    pctx.beginPath();
    dctx.clearRect(0, 0, draft.width, draft.height);
    dctx.beginPath();
    dctx.fillStyle = "black";
    
    redraw();
};

// プレビューの更新
const updatePreview = () => {
    pctx.clearRect(0, 0, preview.width, preview.height);
    pctx.beginPath();

    switch (toolType) {
        case "stroke":
        case "eraser":
            if (trajectories.length >= 4) { // 線の描画
                drawStroke(projectOnToCanvas([trajectories.at(-4), trajectories.at(-3), trajectories.at(-2), trajectories.at(-1)]));
            } else if (trajectories.length >= 2) { // 点の描画
                drawStroke(projectOnToCanvas([trajectories.at(-2), trajectories.at(-1)]));
            }
            break;
        case "shape":
            break;
    }

    // 下書きの反映
    pctx.drawImage(draft, 0, 0);
    pctx.fillStyle = draftStyle;
    pctx.globalCompositeOperation = "source-atop"; // RGB値の適用
    pctx.fillRect(0, 0, preview.width, preview.height);
    pctx.globalCompositeOperation = "destination-in"; // アルファ値の適用
    pctx.fillRect(0, 0, preview.width, preview.height);
    pctx.globalCompositeOperation = "source-over";
    pctx.fillStyle = "white";

    redraw();
};

// プレビューの反映
const reflectPreview = () => {
    if (setRestrictionLevel(10))
        return;

    switch (toolType) {
        case "stroke":
            cctx.drawImage(preview, 0, 0);
            break;
        case "eraser":
            cctx.globalCompositeOperation = "destination-out";
            cctx.drawImage(preview, 0, 0);
            cctx.globalCompositeOperation = "source-over";
            break;
        case "shape":
            cctx.drawImage(preview, 0, 0);
            break;
    }

    redraw();
};

// ストロークの登録
const registerStroke = (id = "unknown", type = "stroke", cap = "square", width = 1, height = 1, style = null) => {
    Stroke.registry.set(id, new Stroke(type, cap, width, height, style).generate());
};

// ストロークのバインド
const bindStroke = (id = "unknown") => {
    Stroke.bind(id);
};

// ストロークの描画
const drawStroke = (vertices = []) => {
    const instance = Stroke.instance;

    if (!Stroke.validate(instance))
        return;

    const vLen = vertices.length;
    draftStyle = instance.style ?? toolStyle;
    dctx.translate(instance.ofsX, instance.ofsY);

    if (vLen >= 4) { // 線の描画
        const stroke = calcStroke(vertices);
        const sLen = stroke.length;

        for (let i = 0; i < sLen; i += 2) {
            dctx.drawImage(instance.image, stroke[i], stroke[i + 1], instance.width, instance.height);
        }
    } else if (vLen === 2) { // 点の描画
        dctx.drawImage(instance.image, vertices[0], vertices[1], instance.width, instance.height);
    }

    dctx.resetTransform();
};

// ツールタイプの変更
const setToolType = (type = toolType, announcement = false) => {
    let announceable = type !== toolType;
    let title = "???";

    toolType = type;

    // パラメータの初期化
    switch (toolType) {
        case "stroke":
            title = "Stroke";
            Stroke.bind("stroke");
            break;
        case "eraser":
            title = "Eraser";
            Stroke.bind("eraser");
            break;
    }

    // DOM更新
    updateToolBar();

    if (announceable && announcement)
        announce(`${title}`);
};

// グリッドの更新
const updateGrid = () => {
    gridWidth = canvas.width * cnvScale / 64;
    gridHeight = canvas.height * cnvScale / 64;
    redraw();
};

const startTaskLoop = () => {
};

// ポインターの初期化
const initPointers = event => {
    // メインポインターのバインド
    if (!mainPointerId) {
        mainPointerId = event.pointerId;
    } else if (!subPointerId) {
        subPointerId = event.pointerId;
    }

    // パラメーターの初期化
    trajectories = [];
    twX0 = twY0 = twX = twY = twAglB = twAgl0 = twAgl = twExpB = twDst0 = twDst = NaN;

    pointers.set(event.pointerId, event);
    buttons.add(event.button);
    
    clearPreview();
    updatePointers(event);
};

// ポインターの更新
const updatePointers = event => {
    pointers.set(event.pointerId, event);

    if (restrictionLevel >= 10) {
        return;
    }

    switch (pointers.size) {
        case 1:
            if (mainPointerId !== event.pointerId)
                break;

            if (buttons.size === 1) {
                if (buttons.has(1)) { // カラースポイト
                    const imageData = cctx.getImageData(0, 0, canvas.width, canvas.height);
                    const drpPos = projectOnToCanvas([event.offsetX, event.offsetY]);
                    const bIdx = (Math.floor(drpPos[0]) + Math.floor(drpPos[1]) * imageData.width) * 4;
                    toolStyle = `rgba(${imageData.data[bIdx]} ${imageData.data[bIdx + 1]} ${imageData.data[bIdx + 2]} / ${imageData.data[bIdx + 3] / 255})`;
                } else if (buttons.has(2)) { // 右ドラッグでキャンバスの移動
                    trajectories.push(event.offsetX, event.offsetY);
                    if (trajectories.length >= 4) {
                        translateCanvas(trajectories.at(-2) - trajectories.at(-4), trajectories.at(-1) - trajectories.at(-3));
                    }
                } else {
                    trajectories.push(event.offsetX, event.offsetY);
                    updatePreview();
                }
            }

            break;
        case 2:
            if (mainPointerId && subPointerId === event.pointerId) {
                const mainPointer = pointers.get(mainPointerId);
                const subPointer = event;

                if (mainPointer) {
                    const x = (mainPointer.offsetX + subPointer.offsetX) / 2;
                    const y = (mainPointer.offsetY + subPointer.offsetY) / 2;
                    const dx = subPointer.offsetX - mainPointer.offsetX;
                    const dy = subPointer.offsetY - mainPointer.offsetY;
                    const distance = Math.hypot(dx, dy);
                    const angle = Math.sign(dy) * Math.acos((subPointer.offsetX - mainPointer.offsetX) / distance) * TO_DEGS;

                    // パラメーターの更新
                    twX0 = isFinite(twX) ? twX : x;
                    twY0 = isFinite(twY) ? twY : y;
                    twExpB = isFinite(twExpB) ? twExpB : cnvScaleExp;
                    twDst0 = isFinite(twDst0) ? twDst0 : distance;
                    twAglB = isFinite(twAglB) ? twAglB : cnvAngle;
                    twAgl0 = isFinite(twAgl0) ? twAgl0 : angle;
                    twX = x;
                    twY = y;
                    twDst = distance;
                    twAgl = angle;
                    
                    // キャンバスの変形
                    const dltX = twX - twX0;
                    const dltY = twY - twY0;
                    const dltExp = Math.log2(twDst / twDst0);
                    const dltAgl = twAgl - twAgl0;

                    if (Math.abs(dltAgl) > twRotPlay) {
                        angleCanvas(twAglB + play(dltAgl, twRotPlay), true);
                    } else if (Math.abs(dltExp) >= twExpPlay) {
                        zoomCanvas(x, y, twExpB + dltExp, true);
                    } else {
                        translateCanvas(dltX, dltY);
                    }
                }
            }

            break;
    }
};

// ポインターのクリア
const clearPointers = event => {
    reflectPreview();
    clearPreview();

    pointers.delete(event.pointerId);
    buttons.delete(event.button);

    // 軌跡のクリア
    if (pointers.size === 0) {
        trajectories = [];
    }

    // ポインターのリリース
    if (mainPointerId === event.pointerId) {
        mainPointerId = null;
    }
    if (subPointerId === event.pointerId) {
        subPointerId = null;
        twX0 = twY0 = twX = twY = twAglB = twAgl0 = twAgl = twExpB = twDst0 = twDst = NaN;
    }
};

// キーの入力
const pressKey = (event = null) => {
    //event.preventDefault();

    keys.set(event.key, event);
    mainKeyId = event.key;

    updateKey();
}

const updateKey = () => {
    const hasShift = keys.has("Shift");
    const hasControl = keys.has("Control");

    if (keys.has("Escape")) {
        closeAllPanels();
        return;
    }

    // キャンバスの移動（同時入力可能）
    if (!hasShift) {
        let zero = false, centering = false;

        if (keys.has("z") || keys.has("Z")) {
            zero = true;
        }
        if (keys.has("c") || keys.has("C")) {
            centering = true;
        }

        if (zero) { // キャンバスの左上へ移動
            const cnvHW = canvas.width / 2;
            const cnvHH = canvas.height / 2;
            locateCanvas(
                view.width / 2 + (cnvXAxisX * cnvHW + cnvYAxisX * cnvHH) * cnvScale,
                view.height / 2 + (cnvXAxisY * cnvHW + cnvYAxisY * cnvHH) * cnvScale,
                true
            );
            return;
        }

        if (centering) { // キャンバスの中央へ移動
            centerCanvas(true);
            return;
        }

        let moving = false, direction = 0;

        if (keys.has("a") || keys.has("A") || keys.has("ArrowLeft")) {
            moving = true;
            direction += 0;
        }
        if (keys.has("d") || keys.has("D") || keys.has("ArrowRight")) {
            moving = true;
            direction += 180;
        }
        if (keys.has("w") || keys.has("W") || keys.has("ArrowUp")) {
            moving = true;
            direction += 90;
        }
        if (keys.has("s") || keys.has("S") || keys.has("ArrowDown")) {
            moving = true;
            direction -= 90;
        }

        if (moving) {
            moveCanvas(direction, hasControl ? 128 : 64, true);
        }
    }

    // ツール切り替え（同時入力不可）
    if (hasShift) {
        switch (mainKeyId) {
            case "e":
                setToolType("eraser", true);
                break;
            case "s":
                setToolType("stroke", true);
                break;
        }
    }
};

const releaseKey = (event = null) => {
    event.preventDefault();

    keys.delete(event.key);
    if (event.key === mainKeyId)
        mainKeyId = null;
}

const increaseRestrictionLevel = (inc = 0) => {
    restrictionLevel = Math.max(0, restrictionLevel + inc);
}

const setRestrictionLevel = (lvl = 0) => {
    if (lvl <= restrictionLevel) {
        announce("*Invalid operation*");

        return true;
    }

    return false;
};

// DOMの制御
const htmlElement = (target = "") => target instanceof HTMLElement ? target : document.getElementById(String(target));

// HTML要素の表示切替
const openHTMLElement = (target = "", message = "") => toggleHTMLElement(target, message, true, false);

const closeHTMLElement = (target = "", message = "") => toggleHTMLElement(target, message, false, true);

const toggleHTMLElement = (target = "", message = "", openOnly = false, closeOnly = false) => {
    const element = htmlElement(target);

    if (element) {
        const link = String(element.getAttribute("link") ?? "").split(" ");

        if (element.hidden) {
            if (closeOnly)
                return false;

            element.hidden = false;
            element.style.display = "";

            if (link.length > 0)
                turnOnHTMLElement(...link);

            if (message) {
                announce(message);
            }

            return true;
        } else {
            if (openOnly)
                return false;

            element.hidden = true;
            element.style.display = "none";
            
            if (link.length > 0)
                turnOffHTMLElement(...link);
        }
    }

    return false;
};

// HTML要素の点灯・消灯
const turnOnHTMLElement = (...targets) => {
    let element;

    for (const target of targets) {
        element = htmlElement(target);

        if (element) {
            element.style.border = "thin solid var(--foreground-color)";
        }
    }
}

const turnOffHTMLElement = (...targets) => {
    let element;

    for (const target of targets) {
        element = htmlElement(target);

        if (element) {
            element.style.border = "";
        }
    }
}

// パネルの制御
const togglePanel = (target = "", link = "", message = "") => {
    increaseRestrictionLevel(toggleHTMLElement(target, link, message) ? 10 : -10);
};

const closeAllPanels = () => {
    const nodeList = document.querySelectorAll(".panel");

    nodeList.forEach(element => {
        if (element instanceof HTMLElement) {
            closeHTMLElement(element);
        }
    });
};

// ツールバーの制御
const updateToolBar = () => {
    turnOffHTMLElement(toolStroke);
    turnOffHTMLElement(toolEraser);

    switch (toolType) {
        case "stroke":
            turnOnHTMLElement(toolStroke);
            break;
        case "eraser":
            turnOnHTMLElement(toolEraser);
            break;
        case "shape":
            break;
    }
};

// アナウンスの制御
const announce = (message = "") => {
    announcement.textContent = message;
    announcement.animate(fadeOut, 1000);
};

/** --------アプリケーション-------- */

// キャンバスの初期化
resizeView();
resizeCanvas(1920, 1080);
centerCanvas();
computeCanvasAxis();

// ツールの初期化
registerStroke("stroke", "stroke", "rectangle", 10, 10, "rgba(0 0 0 / 0.5)");
registerStroke("eraser", "eraser", "rectangle", 10, 10, "rgba(0 192 255 / 0.5)");
setToolType("stroke");

// イベントの登録
toolStroke.addEventListener("click", event => setToolType("stroke", true));
toolEraser.addEventListener("click", event => setToolType("eraser", true));
toolColor.addEventListener("click", event => toggleHTMLElement("panel-color", "Color"));
view.addEventListener("pointerdown", event => initPointers(event));
view.addEventListener("pointermove", event => updatePointers(event));
view.addEventListener("pointerup", event => clearPointers(event));
view.addEventListener("pointerout", event => clearPointers(event));
view.addEventListener("wheel", event => stretchCanvas(event.offsetX, event.offsetY, Math.sign(event.deltaY) / 2, true));
addEventListener("keydown", event => pressKey(event), { passive: false });
addEventListener("keyup", event => releaseKey(event), { passive: false });
addEventListener("contextmenu", event => event.preventDefault(), { passive: false }); // 右クリック防止
addEventListener("touchmove", event => event.preventDefault(), { passive: false }); // スクロール防止
addEventListener("resize", event => { // ビューのサイズ変更
    resizeView();
    centerCanvas();
});

// 描画の開始
startDrawing(60);