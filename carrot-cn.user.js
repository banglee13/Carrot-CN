// ==UserScript==
// @name         Carrot-CN - Codeforces 评分预测器
// @namespace    https://github.com/meooow25/carrot
// @version      0.6.8
// @description  Codeforces 排行榜评分变化预测工具（中文版）
// @author       banglee (汉化改编)
// @license      MIT
// @match        *://*.codeforces.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // 配置和常量
    // ============================================
    const PING_INTERVAL = 3 * 60 * 1000;  // 3分钟
    const PREDICT_TEXT_ID = 'carrot-cn-predict-text';
    const DISPLAY_NONE_CLS = 'carrot-cn-display-none';
    const API_PATH = '/api/';

    const Unicode = {
        BLACK_CURVED_RIGHTWARDS_AND_UPWARDS_ARROW: '\u2BAD',
        GREEK_CAPITAL_DELTA: '\u0394',
        GREEK_CAPITAL_PI: '\u03A0',
        INFINITY: '\u221E',
        SLANTED_NORTH_ARROW_WITH_HORIZONTAL_TAIL: '\u2B5C',
        BACKSLANTED_SOUTH_ARROW_WITH_HORIZONTAL_TAIL: '\u2B5D',
    };

    // 列配置
    const PREDICT_COLUMNS = [
        {
            text: '当前表现分',
            id: 'carrot-cn-current-performance',
            setting: 'showColCurrentPerformance',
        },
        {
            text: '预测分数变化',
            id: 'carrot-cn-predicted-delta',
            setting: 'showColPredictedDelta',
        },
        {
            text: '升级所需分数',
            id: 'carrot-cn-rank-up-delta',
            setting: 'showColRankUpDelta',
        },
    ];

    const FINAL_COLUMNS = [
        {
            text: '最终表现分',
            id: 'carrot-cn-final-performance',
            setting: 'showColFinalPerformance',
        },
        {
            text: '最终分数变化',
            id: 'carrot-cn-final-delta',
            setting: 'showColFinalDelta',
        },
        {
            text: '等级变化',
            id: 'carrot-cn-rank-change',
            setting: 'showColRankChange',
        },
    ];

    const ALL_COLUMNS = PREDICT_COLUMNS.concat(FINAL_COLUMNS);

    // 默认设置
    const DEFAULT_PREFS = {
        enablePredictDeltas: true,
        enableFinalDeltas: true,
        showColCurrentPerformance: true,
        showColPredictedDelta: true,
        showColRankUpDelta: true,
        showColFinalPerformance: true,
        showColFinalDelta: true,
        showColRankChange: true,
    };

    // ============================================
    // FFT 卷积实现 (来自 conv.js)
    // ============================================
    class FFTConv {
        constructor(n) {
            let k = 1;
            while ((1 << k) < n) {
                k++;
            }
            this.n = 1 << k;
            const n2 = this.n >> 1;
            this.wr = [];
            this.wi = [];
            const ang = 2 * Math.PI / this.n;
            for (let i = 0; i < n2; i++) {
                this.wr[i] = Math.cos(i * ang);
                this.wi[i] = Math.sin(i * ang);
            }
            this.rev = [0];
            for (let i = 1; i < this.n; i++) {
                this.rev[i] = (this.rev[i >> 1] >> 1) | ((i & 1) << (k - 1));
            }
        }

        reverse(a) {
            for (let i = 1; i < this.n; i++) {
                if (i < this.rev[i]) {
                    const tmp = a[i];
                    a[i] = a[this.rev[i]];
                    a[this.rev[i]] = tmp;
                }
            }
        }

        transform(ar, ai) {
            this.reverse(ar);
            this.reverse(ai);
            const wr = this.wr;
            const wi = this.wi;
            for (let len = 2; len <= this.n; len <<= 1) {
                const half = len >> 1;
                const diff = this.n / len;
                for (let i = 0; i < this.n; i += len) {
                    let pw = 0;
                    for (let j = i; j < i + half; j++) {
                        const k = j + half;
                        const vr = ar[k] * wr[pw] - ai[k] * wi[pw];
                        const vi = ar[k] * wi[pw] + ai[k] * wr[pw];
                        ar[k] = ar[j] - vr;
                        ai[k] = ai[j] - vi;
                        ar[j] += vr;
                        ai[j] += vi;
                        pw += diff;
                    }
                }
            }
        }

        convolve(a, b) {
            if (a.length === 0 || b.length === 0) {
                return [];
            }
            const n = this.n;
            const resLen = a.length + b.length - 1;
            if (resLen > n) {
                throw new Error(
                    `a.length + b.length - 1 is ${a.length} + ${b.length} - 1 = ${resLen}, ` +
                    `expected <= ${n}`);
            }
            const cr = new Array(n).fill(0);
            const ci = new Array(n).fill(0);
            cr.splice(0, a.length, ...a);
            ci.splice(0, b.length, ...b);
            this.transform(cr, ci);

            cr[0] = 4 * cr[0] * ci[0];
            ci[0] = 0;
            for (let i = 1, j = n - 1; i <= j; i++, j--) {
                const ar = cr[i] + cr[j];
                const ai = ci[i] - ci[j];
                const br = ci[j] + ci[i];
                const bi = cr[j] - cr[i];
                cr[i] = ar * br - ai * bi;
                ci[i] = ar * bi + ai * br;
                cr[j] = cr[i];
                ci[j] = -ci[i];
            }

            this.transform(cr, ci);
            const res = [];
            res[0] = cr[0] / (4 * n);
            for (let i = 1, j = n - 1; i <= j; i++, j--) {
                res[i] = cr[j] / (4 * n);
                res[j] = cr[i] / (4 * n);
            }
            res.splice(resLen);
            return res;
        }
    }

    // ============================================
    // 二分查找 (来自 binsearch.js)
    // ============================================
    function binarySearch(left, right, predicate) {
        if (left > right) {
            throw new Error(`left ${left} must be <= right ${right}`);
        }
        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            if (predicate(mid)) {
                right = mid;
            } else {
                left = mid + 1;
            }
        }
        return left;
    }

    // ============================================
    // Codeforces 等级系统 (来自 rank.js)
    // ============================================
    class Rank {
        constructor(name, abbr, low, high, colorClass) {
            this.name = name;
            this.abbr = abbr;
            this.low = low;
            this.high = high;
            this.colorClass = colorClass;
        }

        static forRating(rating) {
            if (rating == null) {
                return Rank.UNRATED;
            }
            for (const rank of Rank.RATED) {
                if (rating < rank.high) {
                    return rank;
                }
            }
            return Rank.RATED[Rank.RATED.length - 1];
        }
    }

    Rank.UNRATED = new Rank('Unrated', 'U', -Infinity, null, '');
    Rank.RATED = [
        new Rank('Newbie', 'N', -Infinity, 1200, 'user-gray'),
        new Rank('Pupil', 'P', 1200, 1400, 'user-green'),
        new Rank('Specialist', 'S', 1400, 1600, 'user-cyan'),
        new Rank('Expert', 'E', 1600, 1900, 'user-blue'),
        new Rank('Candidate Master', 'CM', 1900, 2100, 'user-violet'),
        new Rank('Master', 'M', 2100, 2300, 'user-orange'),
        new Rank('International Master', 'IM', 2300, 2400, 'user-orange'),
        new Rank('Grandmaster', 'GM', 2400, 2600, 'user-red'),
        new Rank('International Grandmaster', 'IGM', 2600, 3000, 'user-red'),
        new Rank('Legendary Grandmaster', 'LGM', 3000, 4000, 'user-legendary'),
        new Rank('Tourist', 'T', 4000, Infinity, 'user-4000'),
    ];

    // ============================================
    // 评分预测算法 (来自 predict.js)
    // ============================================
    const PRINT_PERFORMANCE = false;
    const DEFAULT_RATING = 1400;

    class Contestant {
        constructor(handle, points, penalty, rating) {
            this.handle = handle;
            this.points = points;
            this.penalty = penalty;
            this.rating = rating;
            this.effectiveRating = rating == null ? DEFAULT_RATING : rating;

            this.rank = null;
            this.delta = null;
            this.performance = null;
        }
    }

    class PredictResult {
        constructor(handle, rating, delta, performance) {
            this.handle = handle;
            this.rating = rating;
            this.delta = delta;
            this.performance = performance;
        }

        get effectiveRating() {
            return this.rating == null ? DEFAULT_RATING : this.rating;
        }
    }

    const MAX_RATING_LIMIT = 6000;
    const MIN_RATING_LIMIT = -500;
    const RATING_RANGE_LEN = MAX_RATING_LIMIT - MIN_RATING_LIMIT;
    const ELO_OFFSET = RATING_RANGE_LEN;
    const RATING_OFFSET = -MIN_RATING_LIMIT;

    // ELO 胜率表
    const ELO_WIN_PROB = new Array(2 * RATING_RANGE_LEN + 1);
    for (let i = -RATING_RANGE_LEN; i <= RATING_RANGE_LEN; i++) {
        ELO_WIN_PROB[i + ELO_OFFSET] = 1 / (1 + Math.pow(10, i / 400));
    }

    const fftConv = new FFTConv(ELO_WIN_PROB.length + RATING_RANGE_LEN - 1);

    class RatingCalculator {
        constructor(contestants) {
            this.contestants = contestants;
            this.seed = null;
            this.adjustment = null;
        }

        calculateDeltas(calcPerfs = false) {
            const startTime = performance.now();
            this.calcSeed();
            this.reassignRanks();
            this.calculateDeltasForContestants();
            this.adjustDeltas();
            if (calcPerfs) {
                this.calcPerfs();
            }
            const endTime = performance.now();
            if (PRINT_PERFORMANCE) {
                console.info(`[Carrot-CN] 评分计算耗时 ${endTime - startTime}ms`);
            }
        }

        calcSeed() {
            const counts = new Array(RATING_RANGE_LEN).fill(0);
            for (const c of this.contestants) {
                counts[c.effectiveRating + RATING_OFFSET] += 1;
            }
            this.seed = fftConv.convolve(ELO_WIN_PROB, counts);
            for (let i = 0; i < this.seed.length; i++) {
                this.seed[i] += 1;
            }
        }

        getSeed(r, exclude) {
            return this.seed[r + ELO_OFFSET + RATING_OFFSET] - ELO_WIN_PROB[r - exclude + ELO_OFFSET];
        }

        reassignRanks() {
            this.contestants.sort(
                (a, b) => a.points !== b.points ? b.points - a.points : a.penalty - b.penalty);
            let lastPoints, lastPenalty, rank;
            for (let i = this.contestants.length - 1; i >= 0; i--) {
                const c = this.contestants[i];
                if (c.points !== lastPoints || c.penalty !== lastPenalty) {
                    lastPoints = c.points;
                    lastPenalty = c.penalty;
                    rank = i + 1;
                }
                c.rank = rank;
            }
        }

        calcDelta(contestant, assumedRating) {
            const c = contestant;
            const seed = this.getSeed(assumedRating, c.effectiveRating);
            const midRank = Math.sqrt(c.rank * seed);
            const needRating = this.rankToRating(midRank, c.effectiveRating);
            const delta = Math.trunc((needRating - assumedRating) / 2);
            return delta;
        }

        calculateDeltasForContestants() {
            for (const c of this.contestants) {
                c.delta = this.calcDelta(c, c.effectiveRating);
            }
        }

        rankToRating(rank, selfRating) {
            return binarySearch(
                2, MAX_RATING_LIMIT,
                (rating) => this.getSeed(rating, selfRating) < rank) - 1;
        }

        adjustDeltas() {
            this.contestants.sort((a, b) => b.effectiveRating - a.effectiveRating);
            const n = this.contestants.length;
            {
                const deltaSum = this.contestants.reduce((a, b) => a + b.delta, 0);
                const inc = Math.trunc(-deltaSum / n) - 1;
                this.adjustment = inc;
                for (const c of this.contestants) {
                    c.delta += inc;
                }
            }
            {
                const zeroSumCount = Math.min(4 * Math.round(Math.sqrt(n)), n);
                const deltaSum = this.contestants.slice(0, zeroSumCount).reduce((a, b) => a + b.delta, 0);
                const inc = Math.min(Math.max(Math.trunc(-deltaSum / zeroSumCount), -10), 0);
                this.adjustment += inc;
                for (const c of this.contestants) {
                    c.delta += inc;
                }
            }
        }

        calcPerfs() {
            for (const c of this.contestants) {
                if (c.rank === 1) {
                    c.performance = Infinity;
                } else {
                    c.performance = binarySearch(
                        MIN_RATING_LIMIT, MAX_RATING_LIMIT,
                        (assumedRating) => this.calcDelta(c, assumedRating) + this.adjustment <= 0);
                }
            }
        }
    }

    function calculatePredictions(contestants, calcPerfs = false) {
        new RatingCalculator(contestants).calculateDeltas(calcPerfs);
        return contestants.map((c) => new PredictResult(c.handle, c.rating, c.delta, c.performance));
    }

    // ============================================
    // 预测响应处理 (来自 predict-response.js)
    // ============================================
    class PredictResponseRow {
        constructor(delta, rank, performance, newRank, deltaReqForRankUp, nextRank) {
            this.delta = delta;
            this.rank = rank;
            this.performance = performance;
            this.newRank = newRank;
            this.deltaReqForRankUp = deltaReqForRankUp;
            this.nextRank = nextRank;
        }
    }

    class PredictResponse {
        constructor(predictResults, type, fetchTime) {
            PredictResponse.assertTypeOk(type);
            this.rowMap = {};
            this.type = type;
            this.fetchTime = fetchTime;
            this.populateMap(predictResults);
        }

        populateMap(predictResults) {
            for (const result of predictResults) {
                let rank, newRank, deltaReqForRankUp, nextRank;
                switch (this.type) {
                    case PredictResponse.TYPE_PREDICTED:
                        rank = Rank.forRating(result.rating);
                        const effectiveRank = Rank.forRating(result.effectiveRating);
                        deltaReqForRankUp = effectiveRank.high - result.effectiveRating;
                        nextRank = Rank.RATED[Rank.RATED.indexOf(effectiveRank) + 1] || null;
                        break;
                    case PredictResponse.TYPE_FINAL:
                        rank = Rank.forRating(result.rating);
                        newRank = Rank.forRating(result.effectiveRating + result.delta);
                        break;
                    default:
                        throw new Error('未知的预测类型');
                }
                const performance = {
                    value: result.performance === Infinity ? 'Infinity' : result.performance,
                    colorClass: Rank.forRating(result.performance).colorClass,
                };
                this.rowMap[result.handle] =
                    new PredictResponseRow(
                        result.delta, rank, performance, newRank, deltaReqForRankUp, nextRank);
            }
        }

        static assertTypeOk(type) {
            if (!PredictResponse.TYPES.includes(type)) {
                throw new Error('未知的预测类型: ' + type);
            }
        }
    }

    PredictResponse.TYPE_PREDICTED = 'PREDICTED';
    PredictResponse.TYPE_FINAL = 'FINAL';
    PredictResponse.TYPES = [PredictResponse.TYPE_PREDICTED, PredictResponse.TYPE_FINAL];

    // ============================================
    // 缓存管理
    // ============================================
    const Cache = {
        get: (key) => {
            try {
                const data = GM_getValue(key, null);
                if (!data) return null;
                const parsed = JSON.parse(data);
                if (parsed.expiry && Date.now() > parsed.expiry) {
                    return null;
                }
                return parsed.value;
            } catch (e) {
                return null;
            }
        },
        set: (key, value, ttlMinutes = 60) => {
            const data = {
                value: value,
                expiry: Date.now() + ttlMinutes * 60 * 1000
            };
            GM_setValue(key, JSON.stringify(data));
        },
        clear: () => {
            // Tampermonkey 不支持枚举所有值，这里只是占位
        }
    };

    // ============================================
    // API 调用
    // ============================================
    async function apiFetch(path, queryParamList = []) {
        const url = new URL(location.origin + API_PATH + path);
        for (const [key, value] of queryParamList) {
            url.searchParams.append(key, value);
        }

        // 检查缓存
        const cacheKey = url.toString();
        const cached = Cache.get(cacheKey);
        if (cached) {
            console.log('[Carrot-CN] 使用缓存:', path);
            return cached;
        }

        console.log('[Carrot-CN] API 请求:', url.toString());

        // 添加延迟以避免请求过快
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            const resp = await fetch(url, {
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json',
                }
            });

            console.log('[Carrot-CN] API 响应状态:', resp.status);

            const text = await resp.text();
            if (resp.status !== 200) {
                throw new Error(`CF API: HTTP 错误 ${resp.status}: ${text.substring(0, 200)}`);
            }
            let json;
            try {
                json = JSON.parse(text);
            } catch (_) {
                throw new Error(`CF API: 无效的 JSON: ${text.substring(0, 200)}`);
            }
            if (json.status !== 'OK' || json.result === undefined) {
                throw new Error(`CF API: 错误: ${text.substring(0, 200)}`);
            }

            // 缓存结果 (5分钟)
            Cache.set(cacheKey, json.result, 5);
            console.log('[Carrot-CN] API 请求成功:', path);
            return json.result;
        } catch (e) {
            console.error('[Carrot-CN] API 请求失败:', e);
            throw e;
        }
    }

    // ============================================
    // UI 辅助函数
    // ============================================
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .carrot-cn-display-none {
                display: none !important;
            }
            .carrot-cn-predict-text {
                font-size: 0.8em;
                color: #888;
            }
            th.carrot-cn-header {
                text-align: center;
            }
            td.carrot-cn-cell {
                text-align: center;
            }
        `;
        document.head.appendChild(style);
    }

    function makeGreySpan(text, title) {
        const span = document.createElement('span');
        span.style.fontWeight = 'bold';
        span.style.color = 'lightgrey';
        span.textContent = text;
        if (title) {
            span.title = title;
        }
        span.classList.add('small');
        return span;
    }

    function makePerformanceSpan(performance) {
        const span = document.createElement('span');
        if (performance.value === 'Infinity') {
            span.textContent = Unicode.INFINITY;
        } else {
            span.textContent = performance.value;
            if (performance.colorClass) {
                span.classList.add(performance.colorClass);
            }
        }
        span.style.fontWeight = 'bold';
        span.style.display = 'inline-block';
        return span;
    }

    function makeRankSpan(rank) {
        const span = document.createElement('span');
        if (rank.colorClass) {
            span.classList.add(rank.colorClass);
        }
        span.style.verticalAlign = 'middle';
        span.textContent = rank.abbr;
        span.title = rank.name;
        span.style.display = 'inline-block';
        return span;
    }

    function makeArrowSpan(arrow) {
        const span = document.createElement('span');
        span.classList.add('small');
        span.style.verticalAlign = 'middle';
        span.style.paddingLeft = '0.5em';
        span.style.paddingRight = '0.5em';
        span.textContent = arrow;
        return span;
    }

    function makeDeltaSpan(delta) {
        const span = document.createElement('span');
        span.style.fontWeight = 'bold';
        span.style.verticalAlign = 'middle';
        if (delta > 0) {
            span.style.color = 'green';
            span.textContent = `+${delta}`;
        } else {
            span.style.color = 'gray';
            span.textContent = delta;
        }
        return span;
    }

    function makeFinalRankUpSpan(rank, newRank, arrow) {
        const span = document.createElement('span');
        span.style.fontWeight = 'bold';
        span.appendChild(makeRankSpan(rank));
        span.appendChild(makeArrowSpan(arrow));
        span.appendChild(makeRankSpan(newRank));
        return span;
    }

    function makePredictedRankUpSpan(rank, deltaReqForRankUp, nextRank) {
        const span = document.createElement('span');
        span.style.fontWeight = 'bold';

        if (nextRank === null) {
            span.appendChild(makeRankSpan(rank));
            return span;
        }

        span.appendChild(makeDeltaSpan(deltaReqForRankUp));
        span.appendChild(makeArrowSpan(Unicode.SLANTED_NORTH_ARROW_WITH_HORIZONTAL_TAIL));
        span.appendChild(makeRankSpan(nextRank));
        return span;
    }

    function makePerfHeaderCell() {
        const cell = document.createElement('th');
        cell.classList.add('top', 'carrot-cn-header');
        cell.style.width = '4em';
        const span = document.createElement('span');
        span.textContent = Unicode.GREEK_CAPITAL_PI;
        span.title = '表现分 - 分数变化为零时的评分';
        cell.appendChild(span);
        return cell;
    }

    function makeDeltaHeaderCell(deltaColTitle) {
        const cell = document.createElement('th');
        cell.classList.add('top', 'carrot-cn-header');
        cell.style.width = '4.5em';
        const span = document.createElement('span');
        span.textContent = Unicode.GREEK_CAPITAL_DELTA;
        span.title = deltaColTitle;
        cell.appendChild(span);
        cell.appendChild(document.createElement('br'));
        const smallSpan = document.createElement('span');
        smallSpan.classList.add('small', 'carrot-cn-predict-text');
        smallSpan.id = PREDICT_TEXT_ID;
        cell.appendChild(smallSpan);
        return cell;
    }

    function makeRankUpHeaderCell(rankUpColWidth, rankUpColTitle) {
        const cell = document.createElement('th');
        cell.classList.add('top', 'right', 'carrot-cn-header');
        cell.style.width = rankUpColWidth;
        const span = document.createElement('span');
        span.textContent = Unicode.BLACK_CURVED_RIGHTWARDS_AND_UPWARDS_ARROW;
        span.title = rankUpColTitle;
        cell.appendChild(span);
        return cell;
    }

    function makeDataCell(bottom = false, right = false) {
        const cell = document.createElement('td');
        cell.classList.add('carrot-cn-cell');
        if (bottom) {
            cell.classList.add('bottom');
        }
        if (right) {
            cell.classList.add('right');
        }
        return cell;
    }

    function populateCells(row, type, rankUpTint, perfCell, deltaCell, rankUpCell) {
        if (row === undefined) {
            perfCell.appendChild(makeGreySpan('N/A', '不适用'));
            deltaCell.appendChild(makeGreySpan('N/A', '不适用'));
            rankUpCell.appendChild(makeGreySpan('N/A', '不适用'));
            return;
        }

        perfCell.appendChild(makePerformanceSpan(row.performance));
        deltaCell.appendChild(makeDeltaSpan(row.delta));
        switch (type) {
            case 'FINAL':
                if (row.rank.abbr === row.newRank.abbr) {
                    rankUpCell.appendChild(makeGreySpan('无变化', '等级无变化'));
                } else {
                    const arrow =
                        row.delta > 0
                            ? Unicode.SLANTED_NORTH_ARROW_WITH_HORIZONTAL_TAIL
                            : Unicode.BACKSLANTED_SOUTH_ARROW_WITH_HORIZONTAL_TAIL;
                    rankUpCell.appendChild(makeFinalRankUpSpan(row.rank, row.newRank, arrow));
                }
                break;
            case 'PREDICTED':
                rankUpCell.appendChild(
                    makePredictedRankUpSpan(row.rank, row.deltaReqForRankUp, row.nextRank));
                if (row.delta >= row.deltaReqForRankUp) {
                    const [color, priority] = rankUpTint;
                    rankUpCell.style.setProperty('background-color', color, priority);
                }
                break;
            default:
                throw new Error('未知的预测类型');
        }
    }

    function updateStandings(resp) {
        let deltaColTitle, rankUpColWidth, rankUpColTitle, columns;
        switch (resp.type) {
            case 'FINAL':
                deltaColTitle = '最终分数变化';
                rankUpColWidth = '6.5em';
                rankUpColTitle = '等级变化';
                columns = FINAL_COLUMNS;
                break;
            case 'PREDICTED':
                deltaColTitle = '预测分数变化';
                rankUpColWidth = '7.5em';
                rankUpColTitle = '升级所需分数';
                columns = PREDICT_COLUMNS;
                break;
            default:
                throw new Error('未知的预测类型');
        }

        const rows = Array.from(document.querySelectorAll('table.standings tbody tr'));
        for (const [idx, tableRow] of rows.entries()) {
            tableRow.querySelector('th:last-child, td:last-child').classList.remove('right');

            let perfCell, deltaCell, rankUpCell;
            if (idx === 0) {
                perfCell = makePerfHeaderCell();
                deltaCell = makeDeltaHeaderCell(deltaColTitle);
                rankUpCell = makeRankUpHeaderCell(rankUpColWidth, rankUpColTitle);
            } else if (idx === rows.length - 1) {
                perfCell = makeDataCell(true);
                deltaCell = makeDataCell(true);
                rankUpCell = makeDataCell(true, true);
            } else {
                perfCell = makeDataCell();
                deltaCell = makeDataCell();
                rankUpCell = makeDataCell(false, true);
                const handle = tableRow.querySelector('td.contestant-cell').textContent.trim();
                let rankUpTint;
                if (tableRow.classList.contains('highlighted-row')) {
                    rankUpTint = ['#d1eef2', 'important'];
                } else {
                    rankUpTint = [idx % 2 ? '#ebf8eb' : '#f2fff2', undefined];
                }
                populateCells(resp.rowMap[handle], resp.type, rankUpTint, perfCell, deltaCell, rankUpCell);
            }

            const cells = [perfCell, deltaCell, rankUpCell];
            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];
                if (idx % 2) {
                    cell.classList.add('dark');
                }
                cell.classList.add(columns[i].id, DISPLAY_NONE_CLS);
                tableRow.appendChild(cell);
            }
        }

        return columns;
    }

    function updateColumnVisibility(prefs) {
        for (const col of ALL_COLUMNS) {
            const showCol = prefs[col.setting];
            const func =
                showCol ?
                    (cell) => cell.classList.remove(DISPLAY_NONE_CLS) :
                    (cell) => cell.classList.add(DISPLAY_NONE_CLS);
            document.querySelectorAll(`.${col.id}`).forEach(func);
        }
    }

    function showFinal() {
        const predictTextSpan = document.getElementById(PREDICT_TEXT_ID);
        if (predictTextSpan) {
            predictTextSpan.textContent = '最终结果';
        }
    }

    function showTimer(fetchTime) {
        const predictTextSpan = document.getElementById(PREDICT_TEXT_ID);
        if (!predictTextSpan) return;

        function update() {
            const secSincePredict = Math.floor((Date.now() - fetchTime) / 1000);
            if (secSincePredict < 30) {
                predictTextSpan.textContent = '刚刚';
            } else if (secSincePredict < 60) {
                predictTextSpan.textContent = '<1分钟前';
            } else {
                predictTextSpan.textContent = Math.floor(secSincePredict / 60) + '分钟前';
            }
        }
        update();
        setInterval(update, 1000);
    }

    // ============================================
    // 设置管理
    // ============================================
    function getPrefs() {
        const prefs = {};
        for (const key of Object.keys(DEFAULT_PREFS)) {
            const value = GM_getValue(key, null);
            prefs[key] = value !== null ? value : DEFAULT_PREFS[key];
        }
        return prefs;
    }

    function setPref(key, value) {
        GM_setValue(key, value);
    }

    // ============================================
    // 预测逻辑
    // ============================================
    const UNRATED_HINTS = ['unrated', 'fools', 'q#', 'kotlin', 'marathon', 'teams', '愚人节'];
    const EDU_ROUND_RATED_THRESHOLD = 2100;

    function isUnratedByName(contestName) {
        const lower = contestName.toLowerCase();
        return UNRATED_HINTS.some((hint) => lower.includes(hint));
    }

    function anyRowHasTeam(rows) {
        return rows.some((row) => row.party && (row.party.teamId != null || row.party.teamName != null));
    }

    function predictForRows(rows, ratingBeforeContest) {
        const contestants = rows.map((row) => {
            const handle = row.party.members[0].handle;
            return new Contestant(handle, row.points, row.penalty, ratingBeforeContest.get(handle));
        });
        return calculatePredictions(contestants, true);
    }

    function getFinal(contest, fetchTime) {
        const ratingBeforeContest = new Map(
            contest.ratingChanges.map((c) => [c.handle, contest.oldRatings[c.handle]]));
        const rows = contest.rows.filter((row) => {
            const handle = row.party.members[0].handle;
            return ratingBeforeContest.has(handle);
        });
        const predictResultsForPerf = predictForRows(rows, ratingBeforeContest);
        const performances = new Map(predictResultsForPerf.map((r) => [r.handle, r.performance]));

        const predictResults = [];
        for (const change of contest.ratingChanges) {
            predictResults.push(
                new PredictResult(
                    change.handle, change.oldRating, change.newRating - change.oldRating,
                    performances.get(change.handle)));
        }
        return new PredictResponse(predictResults, PredictResponse.TYPE_FINAL, fetchTime);
    }

    async function getPredicted(contest, fetchTime) {
        // 获取当前评分
        const ratedList = await apiFetch('user.ratedList', { activeOnly: true });
        const ratingMap = new Map();
        for (const user of ratedList) {
            ratingMap.set(user.handle, user.rating);
        }

        const isEduRound = contest.contest.name.toLowerCase().includes('educational');
        let rows = contest.rows;
        if (isEduRound) {
            rows = contest.rows.filter((row) => {
                const handle = row.party.members[0].handle;
                return !ratingMap.has(handle) || ratingMap.get(handle) < EDU_ROUND_RATED_THRESHOLD;
            });
        }
        const predictResults = predictForRows(rows, ratingMap);
        return new PredictResponse(predictResults, PredictResponse.TYPE_PREDICTED, fetchTime);
    }

    async function calcDeltas(contestId) {
        console.log('[Carrot-CN] 开始计算评分变化，比赛ID:', contestId);
        const prefs = getPrefs();
        console.log('[Carrot-CN] 用户设置:', prefs);

        if (!prefs.enablePredictDeltas && !prefs.enableFinalDeltas) {
            console.log('[Carrot-CN] 预测功能已禁用');
            return { result: 'DISABLED' };
        }

        try {
            // 获取比赛信息
            console.log('[Carrot-CN] 获取比赛列表...');
            const contests = await apiFetch('contest.list');
            const contestBasic = contests.find(c => c.id == contestId);
            if (contestBasic && isUnratedByName(contestBasic.name)) {
                console.log('[Carrot-CN] 非积分赛:', contestBasic.name);
                return { result: 'UNRATED_CONTEST' };
            }

            // 获取排行榜
            console.log('[Carrot-CN] 获取排行榜...');
            const standings = await apiFetch('contest.standings', [['contestId', contestId]]);
            const contest = standings.contest;
            const rows = standings.rows;
            console.log('[Carrot-CN] 获取到', rows.length, '行数据');

            // 检查是否为非积分赛
            if (isUnratedByName(contest.name) || anyRowHasTeam(rows)) {
                console.log('[Carrot-CN] 非积分赛或包含团队');
                return { result: 'UNRATED_CONTEST' };
            }

            const fetchTime = Date.now();

            // 尝试获取评分变化（已结束的比赛）
            console.log('[Carrot-CN] 尝试获取评分变化...');
            let ratingChanges = [];
            try {
                ratingChanges = await apiFetch('contest.ratingChanges', [['contestId', contestId]]);
                console.log('[Carrot-CN] 获取到', ratingChanges.length, '条评分变化');
            } catch (e) {
                console.log('[Carrot-CN] 未获取到评分变化，比赛可能还未结束');
            }

            // 如果有评分变化，显示最终结果
            if (ratingChanges && ratingChanges.length > 0) {
                if (!prefs.enableFinalDeltas) {
                    return { result: 'DISABLED' };
                }

                const oldRatings = {};
                for (const rc of ratingChanges) {
                    oldRatings[rc.handle] = rc.oldRating;
                }

                console.log('[Carrot-CN] 返回最终结果');
                return {
                    result: 'OK',
                    prefs,
                    predictResponse: getFinal({
                        contest,
                        rows,
                        ratingChanges,
                        oldRatings
                    }, fetchTime),
                };
            }

            // 否则进行预测
            if (!prefs.enablePredictDeltas) {
                return { result: 'DISABLED' };
            }

            console.log('[Carrot-CN] 进行预测计算...');
            return {
                result: 'OK',
                prefs,
                predictResponse: await getPredicted({ contest, rows }, fetchTime),
            };
        } catch (e) {
            console.error('[Carrot-CN] calcDeltas 错误:', e);
            throw e;
        }
    }

    async function predict(contestId) {
        const response = await calcDeltas(contestId);
        switch (response.result) {
            case 'OK':
                break;
            case 'UNRATED_CONTEST':
                console.info('[Carrot-CN] 非积分赛，不显示分数变化列。');
                return;
            case 'DISABLED':
                console.info('[Carrot-CN] 根据用户设置，此比赛的分数变化已禁用。');
                return;
            default:
                throw new Error('未知的结果类型');
        }

        const columns = updateStandings(response.predictResponse);
        switch (response.predictResponse.type) {
            case 'FINAL':
                showFinal();
                break;
            case 'PREDICTED':
                showTimer(response.predictResponse.fetchTime);
                break;
            default:
                throw new Error('未知的预测类型');
        }
        updateColumnVisibility(response.prefs);
        return columns;
    }

    // ============================================
    // 设置面板
    // ============================================
    function createSettingsPanel() {
        const panel = document.createElement('div');
        panel.id = 'carrot-cn-settings-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #3b5998;
            border-radius: 8px;
            padding: 20px;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            min-width: 300px;
            font-family: Arial, sans-serif;
        `;

        const title = document.createElement('h3');
        title.textContent = 'Carrot-CN 设置';
        title.style.marginTop = '0';
        panel.appendChild(title);

        const prefs = getPrefs();

        const options = [
            { key: 'enablePredictDeltas', label: '启用预测分数变化' },
            { key: 'enableFinalDeltas', label: '启用最终分数变化' },
            { key: 'showColCurrentPerformance', label: '显示当前表现分列' },
            { key: 'showColPredictedDelta', label: '显示预测分数变化列' },
            { key: 'showColRankUpDelta', label: '显示升级所需分数列' },
            { key: 'showColFinalPerformance', label: '显示最终表现分列' },
            { key: 'showColFinalDelta', label: '显示最终分数变化列' },
            { key: 'showColRankChange', label: '显示等级变化列' },
        ];

        for (const opt of options) {
            const label = document.createElement('label');
            label.style.display = 'block';
            label.style.margin = '10px 0';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = prefs[opt.key];
            checkbox.style.marginRight = '8px';
            checkbox.addEventListener('change', (e) => {
                setPref(opt.key, e.target.checked);
            });

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(opt.label));
            panel.appendChild(label);
        }

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        closeBtn.style.cssText = `
            margin-top: 15px;
            padding: 8px 20px;
            background: #3b5998;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        `;
        closeBtn.addEventListener('click', () => {
            panel.remove();
            // 刷新页面以应用更改
            location.reload();
        });
        panel.appendChild(closeBtn);

        // 点击外部关闭
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
        `;
        overlay.addEventListener('click', () => {
            panel.remove();
            overlay.remove();
        });

        document.body.appendChild(overlay);
        document.body.appendChild(panel);
    }

    // ============================================
    // 主函数
    // ============================================
    const state = {
        columns: null,
        error: null,
    };

    function main() {
        console.log('[Carrot-CN] main() 开始执行');

        // 添加样式
        addStyles();

        // 注册菜单命令
        if (typeof GM_registerMenuCommand !== 'undefined') {
            GM_registerMenuCommand('Carrot-CN 设置', createSettingsPanel);
        }

        // 检查是否在排行榜页面
        const matches = location.pathname.match(/contest\/(\d+)\/standings/);
        const contestId = matches ? matches[1] : null;

        console.log('[Carrot-CN] main() 比赛ID:', contestId);

        if (contestId) {
            predict(contestId)
                .then(columns => {
                    console.log('[Carrot-CN] 预测完成，列:', columns);
                    state.columns = columns;
                })
                .catch(er => {
                    console.error('[Carrot-CN] 预测错误: %o', er);
                    state.error = er.toString();
                });
        }
    }

    // 启动
    console.log('[Carrot-CN] 脚本已加载，当前路径:', location.pathname);

    function tryInit() {
        console.log('[Carrot-CN] 尝试初始化...');
        const matches = location.pathname.match(/contest\/(\d+)\/standings/);
        const contestId = matches ? matches[1] : null;
        const table = document.querySelector('table.standings');

        console.log('[Carrot-CN] 比赛ID:', contestId, '表格存在:', !!table);

        if (contestId && table) {
            main();
        } else if (contestId) {
            // 表格可能还没加载，等待一下
            console.log('[Carrot-CN] 表格未找到，1秒后重试...');
            setTimeout(tryInit, 1000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }

})();
