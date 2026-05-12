// ビュー
const view = document.querySelector("#view");
const vctx = view.getContext("2d");
let requiresRedrawing = true;
let drawingLoopId = null;

// キャンバス
const canvas = new OffscreenCanvas(0, 0);
const cctx = canvas.getContext("2d");
let cnvX = 0, cnvY = 0, cnvOfsX = 0, cnvOfsY = 0, cnvAngle = 0, cnvScale = 1;
let cnvXAxis = [1, 0], cnvYAxis = [0, 1];
let cnvScaleExp = 0, cnvScaleMinExp = -6, cnvScaleMaxExp = 6;

// プレビュー
const preview = new OffscreenCanvas(0, 0);
const pctx = preview.getContext("2d");

// ストローク
const stroke = new OffscreenCanvas(0, 0);
const sctx = stroke.getContext("2d");
let strPixel = null; // ImageBitmap
let strType = "square"; // "rectangle", "ellipse"
let strWidth = 1, strHeight = 1, strCntX = 0, strCntY = 0, strOfsX = 0, strOfsY = 0, strXRadSqr = 0, strYRadSqr = 0;
let strBoundX0, strBoundY0, strBoundX1, strBoundY1;

// グリッド
let gridWidth = 0, gridHeight = 0;

// ツール
let toolMode = "stroke"; // "none", "stroke", "shape"
let toolColor = [255, 255, 255, 128]; // RGBA

// 入力
const pointers = new Map();
const buttons = new Set();
let pointerMode = "none"; // "none", "solo", "solo-draw", "solo-move", "twin", "twin-move", "twin-rotate", "twin-scale"
let mainPointerId = null;
let trajectories = []; // メインポインターの軌跡

// UI
const fadeInOut = { opacity: [ 0, 1, 1, 0 ], offset: [ 0, 0.1, 0.8, 1 ] };

const announcement = document.querySelector("#announcement");
const announce = (message = "") => {
    announcement.textContent = message;
    announcement.animate(fadeInOut, 2000);
};

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
    vctx.rotate(cnvAngle * Math.PI / 180);
    vctx.scale(cnvScale, cnvScale);
    vctx.translate(cnvOfsX, cnvOfsY);
    vctx.drawImage(canvas, 0, 0);
    vctx.globalAlpha = toolColor[3] / 255;
    vctx.drawImage(preview, 0, 0);
    vctx.globalAlpha = 1;
    vctx.resetTransform();

    // グリッドの描画
    vctx.globalCompositeOperation = "difference";
    vctx.strokeStyle = "gray";
    vctx.globalAlpha = 0.25;
    vctx.translate(cnvX, cnvY);
    vctx.rotate(cnvAngle * Math.PI / 180);
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
    vctx.rotate(cnvAngle * Math.PI / 180);
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

// ビュー座標をキャンバス座標に変換
const projectOnToCanvas = (pos = [0, 0]) => {
    const dltX = pos[0] - cnvX;
    const dltY = pos[1] - cnvY;
    const dotX = cnvXAxis[0] * dltX + cnvXAxis[1] * dltY;
    const dotY = cnvYAxis[0] * dltX + cnvYAxis[1] * dltY;

    return [
        canvas.width / 2 + Math.sign(dotX) * Math.hypot(dotX * cnvXAxis[0], dotX * cnvXAxis[1]) / cnvScale,
        canvas.height / 2 + Math.sign(dotY) * Math.hypot(dotY * cnvYAxis[0], dotY * cnvYAxis[1]) / cnvScale
    ];
};

// キャンバスの座標軸を計算
const computeCanvasAxis = () => {
    cnvXAxis[0] = Math.cos(cnvAngle * Math.PI / 180);
    cnvXAxis[1] = Math.sin(cnvAngle * Math.PI / 180);
    cnvYAxis[0] = Math.cos((cnvAngle + 90) * Math.PI / 180);
    cnvYAxis[1] = Math.sin((cnvAngle + 90) * Math.PI / 180);
};

// キャンバスの変形
const locateCanvas = (x = 0, y = 0, announcement = false) => {
    cnvX = x;
    cnvY = y;

    if (announcement)
        announce(`Canvas position: (x, y) = (${x}, ${y})`);
    
    redraw();
};

const centerCanvas = (announcement = false) => {
    locateCanvas(view.width / 2, view.height / 2, announcement);
}

const moveCanvas = (dltX = 0, dltY = 0, announcement = false) => {
    locateCanvas(cnvX + dltX, cnvY + dltY, announcement);
};

const rotateCanvas = (angle = 0, announcement = false) => {
    cnvAngle = (cnvAngle + angle) % 360;

    if (announcement)
        announce(`Canvas angle: ${cnvAngle}°`);

    computeCanvasAxis();
    redraw();
};

const scaleCanvas = (scale = 1, announcement = false) => {
    cnvScale = scale;

    if (announcement)
        announce(`Canvas scale: ${cnvScale * 100}%`);
    
    updateGrid();
    redraw();
};

const zoomCanvas = (x = cnvX, y = cnvY, dltExp = 0, announcement = false) => {
    const dltX = cnvX - x;
    const dltY = cnvY - y;
    let dltScale = 0;
    let oldCnvScale = cnvScale;

    cnvScaleExp += dltExp;
    cnvScaleExp = Math.max(cnvScaleMinExp, Math.min(cnvScaleExp, cnvScaleMaxExp));
    cnvScale = 2 ** Math.floor(cnvScaleExp);
    dltScale = cnvScale / oldCnvScale;

    if (announcement)
        announce(`Canvas scale: ${cnvScale * 100}%`);

    moveCanvas(dltX * dltScale - dltX, dltY * dltScale - dltY);
    updateGrid();
    redraw();
}

const resizeCanvas = (width = 0, height = 0) => {
    canvas.width = width;
    canvas.height = height;
    preview.width = canvas.width;
    preview.height = canvas.height;
    stroke.width = preview.width;
    stroke.height = preview.height;
    cnvOfsX = -canvas.width / 2;
    cnvOfsY = -canvas.height / 2;
    updateGrid();
    redraw();
};

// プレビューの更新
const updatePreview = () => {
    switch (toolMode) {
        case "stroke":
            if (trajectories.length === 1) {
                const pos = projectOnToCanvas(trajectories[trajectories.length - 1]);
                drawDot(pos[0], pos[1]);
            } else if (trajectories.length >= 2) {
                const pos0 = projectOnToCanvas(trajectories[trajectories.length - 2]);
                const pos1 = projectOnToCanvas(trajectories[trajectories.length - 1]);
                drawLine(pos0[0], pos0[1], pos1[0], pos1[1]);
            }

            break;
        case "shape":
            break;
    }

    redraw();
};

// プレビューの反映
const reflectPreview = () => {
    const width = strBoundX1 - strBoundX0 + 1;
    const height = strBoundY1 - strBoundY0 + 1;

    if (width > 0 && height > 0) {
        cctx.globalAlpha = toolColor[3] / 255;
        cctx.drawImage(preview, strBoundX0, strBoundY0, width, height, strBoundX0, strBoundY0, width, height);
        cctx.globalAlpha = 1;
        redraw();
    }
};

// プレビューのクリア
const clearPreview = () => {
    pctx.clearRect(0, 0, preview.width, preview.height);
    pctx.beginPath();
    redraw();
};

// ストロークの初期化
const initStroke = (type = "rectangle", width = 1, height = 1) => {
    strType = type;
    strWidth = width;
    strHeight = height;
    strCntX = strWidth / 2;
    strCntY = strHeight / 2;
    strOfsX = -Math.floor(strCntX);
    strOfsY = -Math.floor(strCntY);
    strXRadSqr = strWidth * strWidth / 4;
    strYRadSqr = strHeight * strHeight / 4;

    // ピクセルの初期化
    if (strPixel instanceof ImageBitmap)
        strPixel.close();

    strPixel = (() => {
        const canvas = new OffscreenCanvas(1, 1);
        const context = canvas.getContext("2d");
        context.fillStyle = `rgb(${toolColor[0]}, ${toolColor[1]}, ${toolColor[2]})`;
        context.fillRect(0, 0, 1, 1);
        return canvas.transferToImageBitmap();
    })();
};

const drawPixel = (x = 0, y = 0) => {
    x = Math.floor(x);
    y = Math.floor(y);

    // ストローク境界の拡張
    strBoundX0 = x >= strBoundX0 ? strBoundX0 : x;
    strBoundY0 = y >= strBoundY0 ? strBoundY0 : y;
    strBoundX1 = x <= strBoundX1 ? strBoundX1 : x;
    strBoundY1 = y <= strBoundY1 ? strBoundY1 : y;

    pctx.drawImage(strPixel, x, y);
};

const drawDot = (x = 0, y = 0, scale = 1) => {
    scale = Math.max(0, Math.min(scale, 1));

    switch (strType) {
        case "rectangle":
            for (let j = 0; j < strHeight; ++j) {
                for (let i = 0; i < strWidth; ++i) {
                    drawPixel(x + (i + strOfsX) * scale, y + (j + strOfsY) * scale);
                }
            }
            break;
        case "ellipse":
            for (let j = 0; j < strHeight; ++j) {
                for (let i = 0; i < strWidth; ++i) {
                    if ((i + 0.5 - strCntX) ** 2 / strXRadSqr + (j + 0.5 - strCntY) ** 2 / strYRadSqr > 1)
                        continue;
                    
                    drawPixel(x + (i + strOfsX) * scale, y + (j + strOfsY) * scale);
                }
            }
            break;
    }
};

const drawLine = (x0 = 0, y0 = 0, x1 = 0, y1 = 0, scale0 = 1, scale1 = 1) => {   
    let a0, b0, a1, b1, dir, dltA, dltB;

    dltA = x1 - x0;
    dltB = y1 - y0;

    // 傾きが1未満
    if (Math.abs(dltA) > Math.abs(dltB)) {
        // 右向き
        if (dltA > 0) {
            a0 = x0;
            b0 = y0;
            a1 = x1;
            b1 = y1;
            dir = Math.sign(dltB);
        } else {
            a0 = x1;
            b0 = y1;
            a1 = x0;
            b1 = y0;
            dir = -Math.sign(dltB);
        }

        dltA = Math.abs(dltA);
        dltB = Math.abs(dltB);

        for (let i = a0, j = b0, c = dltB; i <= a1; ++i, c += dltB) {
            if (c >= dltA) {
                j += dir;
                c -= dltA;
            }

            drawDot(i, j);
        }
    } else {
        // 下向き
        if (dltB > 0) {
            a0 = y0;
            b0 = x0;
            a1 = y1;
            b1 = x1;
            dir = Math.sign(dltA);
        } else {
            a0 = y1;
            b0 = x1;
            a1 = y0;
            b1 = x0;
            dir = -Math.sign(dltA);
        }

        dltA = Math.abs(dltB);
        dltB = Math.abs(b1 - b0);

        for (let i = a0, j = b0, c = dltB; i <= a1; ++i, c += dltB) {
            if (c >= dltA) {
                j += dir;
                c -= dltA;
            }

            drawDot(j, i);
        }
    }
};

// グリッドの更新
const updateGrid = () => {
    gridWidth = canvas.width * cnvScale / 64;
    gridHeight = canvas.height * cnvScale / 64;
    redraw();
};

// ポインターの初期化
const initPointers = event => {
    // ポインターモードの初期化
    pointerMode = "none";

    // メインポインターのバインド
    if (!mainPointerId) {
        mainPointerId = event.pointerId;
    }

    pointers.set(event.pointerId, event);
    buttons.add(event.button);

    clearPreview();
};

// ポインターの更新
const updatePointers = event => {
    pointers.set(event.pointerId, event);

    // ポインターモードの設定
    if (pointerMode === "none") {
        switch (pointers.size) {
            case 1:
                pointerMode = "solo";
                break;
            case 2:
                pointerMode = "twin";
                break;
        }
    }

    switch (pointerMode) {
        case "solo":
            if (mainPointerId !== event.pointerId)
                break;

            if (buttons.size === 1) {
                trajectories.push([event.offsetX, event.offsetY]);

                // 右ドラッグでキャンバスの移動
                if (buttons.has(2)) {
                    if (trajectories.length >= 2) {
                        const last = trajectories.length - 1;
                        moveCanvas(
                            trajectories[last][0] - trajectories[last - 1][0],
                            trajectories[last][1] - trajectories[last - 1][1]
                        );
                    }
                } else {
                    updatePreview();
                }
            } else {
                trajectories = [];
                clearPreview();
            }

            break;
        case "twin":
            break;
    }
};

// ポインターのクリア
const clearPointers = event => {
    reflectPreview();
    clearPreview();

    pointers.delete(event.pointerId);
    buttons.delete(event.button);

    // 軌跡のリセット
    if (pointers.size === 0) {
        trajectories = [];
    }

    // メインポインターのリリース
    if (mainPointerId === event.pointerId) {
        mainPointerId = null;
    }

    // ポインターモードのリセット
    pointerMode = "none";
};

view.addEventListener("pointerdown", event => initPointers(event));

view.addEventListener("pointermove", event => updatePointers(event));

view.addEventListener("pointerup", event => clearPointers(event));

view.addEventListener("pointerout", event => clearPointers(event));

view.addEventListener("wheel", event => zoomCanvas(event.offsetX, event.offsetY, Math.sign(event.deltaY) / 2, true));

addEventListener("contextmenu", event => event.preventDefault(), { passive: false }); // 右クリック防止

addEventListener("touchmove", event => event.preventDefault(), { passive: false }); // スクロール防止

// ビューのサイズ変更
addEventListener("resize", event => {
    resizeView();
    centerCanvas();
});

// アプリケーション
const main = (width = 0, height = 0) => {
    resizeView();
    resizeCanvas(width, height);
    centerCanvas();
    initStroke("ellipse", 8, 8);
    startDrawing(30);
};

main(1920, 1080); // アプリの開始