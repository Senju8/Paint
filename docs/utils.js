const lerp = (step = 0, start = 0, end = 0) => {
    return start + (end - start) * step;
}

const dot  = (x0 = 0, y0 = 0, x1 = 0, y1 = 0) => {
    return x0 * y0 + x1 * y1;
};

const cross = (x0 = 0, y0 = 0, x1 = 0, y1 = 0) => {
    return x0 * y1 - y0 * x1;
};

const calcSegment = (x0 = 0, y0 = 0, x1 = 0, y1 = 0) => {
    const segment = [];
    let h0, v0, h1, dir, dh, dv;

    dh = x1 - x0;
    dv = y1 - y0;

    // 傾きの絶対値が1未満
    if (Math.abs(dh) > Math.abs(dv)) {
        // 右向き
        if (dh > 0) {
            h0 = x0;
            v0 = y0;
            h1 = x1;
            dir = Math.sign(dv);
        } else {
            h0 = x1;
            v0 = y1;
            h1 = x0;
            dir = -Math.sign(dv);
        }

        dh = Math.abs(dh);
        dv = Math.abs(dv);

        for (let i = h0, j = v0, c = dv; i <= h1; ++i, c += dv) {
            segment.push(i, j);

            if (c >= dh) {
                j += dir;
                c -= dh;
            }
        }
    } else {
        // 下向き
        if (dv > 0) {
            h0 = y0;
            v0 = x0;
            h1 = y1;
            dir = Math.sign(dh);
        } else {
            h0 = y1;
            v0 = x1;
            h1 = y0;
            dir = -Math.sign(dh);
        }

        dh = Math.abs(dh);
        dv = Math.abs(dv);

        for (let i = h0, j = v0, c = dh; i <= h1; ++i, c += dh) {
            segment.push(j, i);

            if (c >= dv) {
                j += dir;
                c -= dv;
            }
        }
    }

    return segment;
}

const calcStroke = (vertices = []) => {
    if (vertices.length < 4)
        return [...vertices];

    const stroke = [];
    const length = vertices.length - 2;

    for (let i = 0; i < length; i += 2) {
        stroke.push(...calcSegment(vertices[i], vertices[i + 1], vertices[i + 2], vertices[i + 3]));
    }

    return stroke;
}

const calcEllipse = (vr = 0, vh = 0) => {

};