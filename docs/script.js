// ビュー
const view = document.querySelector("#view");
const vctx = view.getContext("2d");
let viewHW = 0, viewHH = 0;

// キャンバス
const canvas = new OffscreenCanvas(0, 0);
const cctx = canvas.getContext("2d");
let cnvX = 0, cnvY = 0, cnvOfsX = 0, cnvOfsY = 0, cnvAngle = 0, cnvScale = 1;

cctx.imageSmoothingEnabled = false;

// グリッド
let gridWidth = 0, gridHeight = 0;

// 入力
const pointers = new Map();
let mainPointerId = null;

// ビューの描画
const drawView = () => {
    if (canvas.width <= 0 || canvas.height <= 0)
        return;

    vctx.clearRect(0, 0, view.width, view.height);
    vctx.beginPath();

    cctx.clearRect(0, 0, canvas.width, canvas.height);
    cctx.beginPath();

    cctx.fillStyle = "white";
    cctx.fillRect(0, 0, 100, 100);
    cctx.fillStyle = "red";
    cctx.fillRect(700, 0, 100, 100);
    cctx.fillStyle = "green";
    cctx.fillRect(700, 700, 100, 100);
    cctx.fillStyle = "blue";
    cctx.fillRect(0, 700, 100, 100);

    // キャンバスの描画
    vctx.translate(cnvX + viewHW, cnvY + viewHH);
    vctx.rotate(cnvAngle * Math.PI / 180);
    vctx.scale(cnvScale, cnvScale);
    vctx.translate(cnvOfsX, cnvOfsY);
    vctx.drawImage(canvas, 0, 0);
    vctx.resetTransform();

    // グリッドの描画
    vctx.strokeStyle = "gray";
    vctx.globalAlpha = 0.5;
    vctx.translate(cnvX + viewHW, cnvY + viewHH);
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

    // フレームの描画
    vctx.strokeStyle = "white";
    vctx.translate(cnvX + viewHW, cnvY + viewHH);
    vctx.rotate(cnvAngle * Math.PI / 180);
    vctx.translate(cnvOfsX * cnvScale, cnvOfsY * cnvScale);
    vctx.beginPath();
    vctx.rect(0, 0, canvas.width * cnvScale, canvas.height * cnvScale);
    vctx.stroke();
    vctx.resetTransform();

    // 十字の描画
    vctx.translate(viewHW, viewHH);
    vctx.globalCompositeOperation = "difference";
    vctx.strokeStyle = "white"
    vctx.beginPath();
    vctx.moveTo(0, -8);
    vctx.lineTo(0, 8);
    vctx.moveTo(-8, 0);
    vctx.lineTo(8, 0);
    vctx.stroke();
    vctx.globalCompositeOperation = "source-over";
    vctx.resetTransform();
};

// ビューの更新
const updateView = () => {
    view.width = innerWidth;
    view.height = innerHeight;
    viewHW = view.width / 2;
    viewHH = view.height / 2;
    gridWidth = canvas.width * cnvScale / 64;
    gridHeight = canvas.height * cnvScale / 64;
    drawView();
};

// キャンバスの変形
const locateCanvas = (x = 0, y = 0) => {
    cnvX = x;
    cnvY = y;
    updateView();
};

const moveCanvas = (dltX = 0, dltY = 0) => {
    locateCanvas(cnvX + dltX, cnvY + dltY);
    updateView();
};

const rotateCanvas = (angle = 0) => {
    cnvAngle = (cnvAngle + angle) % 360;
    updateView();
};

const scaleCanvas = (scale = 1) => {
    cnvScale *= scale;
    updateView();
};

const resizeCanvas = (width = 0, height = 0) => {
    canvas.width = width;
    canvas.height = height;
    cnvOfsX = -canvas.width / 2;
    cnvOfsY = -canvas.height / 2;
    updateView();
};

const start = (width = 0, height = 0) => {
    resizeCanvas(width, height);
};

// 入力の実装
view.addEventListener("pointerdown", event => {
    if (!mainPointerId) {
        mainPointerId = event.pointerId;
    }

    pointers.set(event.pointerId, event);
});

view.addEventListener("pointermove", event => {
    pointers.set(event.pointerId, event);
});

view.addEventListener("pointerup", event => {
    if (mainPointerId === event.pointerId) {
        mainPointerId = null;
    }

    pointers.delete(event.pointerId);
});

addEventListener("contextmenu", event => event.preventDefault(), { passive: false }); // 右クリック防止

addEventListener("touchmove", event => event.preventDefault(), { passive: false }); // スクロール防止

addEventListener("resize", event => updateView()); // ビューのサイズ変更

start(800, 800); // アプリの開始