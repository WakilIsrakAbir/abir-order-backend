// One-time migration script: Parse all existing Excel files into Order collection
require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const File = require('./models/File');
const Order = require('./models/Order');
const OrderDate = require('./models/OrderDate');

function normKey(key) {
    return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getVal(row, keys, km) {
    for (const k of keys) {
        const n = normKey(k);
        if (km[n] !== undefined) {
            const val = row[km[n]];
            return (val === undefined || val === null) ? '' : val;
        }
    }
    return '';
}

function buildKeyMap(row) {
    const map = {};
    for (const rk in row) map[normKey(rk)] = rk;
    return map;
}

function fmtDate(val) {
    if (!val || val === 'N/A' || val === '-') return '';
    if (typeof val === 'number' && val > 25000 && val < 70000) {
        return new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString().split('T')[0];
    }
    if (typeof val === 'string') {
        const p = new Date(val);
        if (!isNaN(p.getTime())) return p.toISOString().split('T')[0];
    }
    return String(val);
}

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });

    // Get latest file per originalName+category
    const allFiles = await File.find().sort({ createdAt: 1 }).lean();
    const latestMap = new Map();
    allFiles.forEach(f => {
        const key = `${f.originalName}__${f.category || 'General'}`;
        latestMap.set(key, f);
    });
    const latestFiles = Array.from(latestMap.values());
    console.log(`Processing ${latestFiles.length} files...`);

    for (const file of latestFiles) {
        try {
            const chunks = [];
            const stream = bucket.openDownloadStreamByName(file.savedName);
            for await (const c of stream) chunks.push(c);
            const buf = Buffer.concat(chunks);
            const wb = XLSX.read(buf, { type: 'buffer' });
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

            const cat = (file.category || 'General').toLowerCase();
            console.log(`  ${file.category} | ${file.originalName} | ${data.length} rows`);

            if (cat === 'general') {
                const ops = [];
                for (const row of data) {
                    const km = buildKeyMap(row);
                    const orderNo = String(getVal(row, ['OrderNo', 'BookingNo', 'EWO', 'Booking', 'Order No', 'Booking No'], km)).trim();
                    if (!orderNo) continue;

                    const buyer = String(getVal(row, ['Buyer', 'BuyerName', 'Customer'], km)).trim().toUpperCase().replace(/\s+/g, ' ');
                    ops.push({
                        updateOne: {
                            filter: { orderNo },
                            update: {
                                $set: {
                                    buyer: (buyer && buyer !== 'UNDEFINED' && buyer !== 'N/A') ? buyer : '',
                                    bookingDate: fmtDate(getVal(row, ['BookingReceiveDate', 'BookingDate', 'Date'], km)),
                                    requiredQtyKgs: getVal(row, ['RequiredQtyKgs', 'Qty', 'Order Qty'], km),
                                    bookingBy: String(getVal(row, ['BookingBy'], km)),
                                    finalConfirmation: String(getVal(row, ['FinalConfirmation', 'Final Confirmation'], km)),
                                    eventDay: getVal(row, ['EventDay', 'Event day'], km),
                                    ship1: fmtDate(getVal(row, ['1stShipmentDate', '1st Shipment Date'], km)),
                                    shipLast: fmtDate(getVal(row, ['LastShipmentDate', 'Last Shipment Date'], km)),
                                    yarnDate: fmtDate(getVal(row, ['TAYarnDate', 'T&A Yarn date'], km)),
                                    knitStart: fmtDate(getVal(row, ['TAKnittingStart', 'T&A Knitting Start'], km)),
                                    knitEnd: fmtDate(getVal(row, ['TAKnittingEnd', 'T&A Knitting End'], km)),
                                    dyeStart: fmtDate(getVal(row, ['TADyeingStart', 'T&A Dyeing Start'], km)),
                                    dyeEnd: fmtDate(getVal(row, ['TADyeingEnd', 'T&A Dyeing End'], km)),
                                    deliStart: fmtDate(getVal(row, ['TADeliStart', 'T&A Deli. Start'], km)),
                                    deliEnd: fmtDate(getVal(row, ['TADeliEnd', 'T&A Deli. End'], km)),
                                    fabricNotes: String(getVal(row, ['FabricNotes', 'Fabric Notes', 'Notes'], km)),
                                    status: String(getVal(row, ['Status'], km))
                                }
                            },
                            upsert: true
                        }
                    });
                }
                if (ops.length > 0) {
                    for (let i = 0; i < ops.length; i += 500) {
                        await Order.bulkWrite(ops.slice(i, i + 500), { ordered: false });
                    }
                }
            } else {
                const deptMap = { yd: 'ydItems', knitting: 'knittingItems', dyeing: 'dyeingItems', finishing: 'finishingItems', delivery: 'deliveryItems' };
                const field = deptMap[cat];
                if (!field) { console.log(`  Skipping unknown category: ${cat}`); continue; }

                const groups = {};
                for (const row of data) {
                    const km = buildKeyMap(row);
                    const orderNo = String(getVal(row, ['OrderNo', 'BookingNo', 'EWO', 'Booking', 'Order No', 'Booking No'], km)).trim();
                    if (!orderNo) continue;
                    if (!groups[orderNo]) groups[orderNo] = [];
                    const clean = {};
                    for (const k in row) { if (!k.startsWith('__EMPTY')) clean[k] = row[k]; }
                    groups[orderNo].push(clean);
                }

                const ops = [];
                for (const [orderNo, items] of Object.entries(groups)) {
                    const update = { [field]: items };
                    // Extract buyer from dept items
                    if (items.length > 0) {
                        const km = buildKeyMap(items[0]);
                        const b = String(getVal(items[0], ['Buyer', 'BuyerName', 'Customer'], km)).trim().toUpperCase().replace(/\s+/g, ' ');
                        if (b && b !== 'UNDEFINED' && b !== 'N/A' && b !== '') update.buyer = b;
                    }
                    ops.push({ updateOne: { filter: { orderNo }, update: { $set: update }, upsert: true } });
                }
                if (ops.length > 0) {
                    for (let i = 0; i < ops.length; i += 500) {
                        await Order.bulkWrite(ops.slice(i, i + 500), { ordered: false });
                    }
                }
            }
        } catch (e) {
            console.error(`  ERROR processing ${file.originalName}: ${e.message}`);
        }
    }

    // Recalculate plan statuses
    console.log('Recalculating plan statuses...');
    const plans = await OrderDate.find({}, {
        orderNo: 1, knitting: 1, knittingStatus: 1, dyeing: 1, dyeingStatus: 1,
        finishing: 1, finishingStatus: 1, delivery: 1, deliveryStatus: 1, yd: 1, ydStatus: 1
    }).lean();

    const statusOps = [];
    for (const plan of plans) {
        const update = {};
        for (const dept of ['knitting', 'dyeing', 'finishing', 'delivery', 'yd']) {
            const items = plan[dept];
            const savedStatus = plan[`${dept}Status`];
            if (savedStatus === 'Completed') {
                update[`${dept}PlanStatus`] = 'Completed';
            } else if (items && Array.isArray(items) && items.length > 0) {
                let hasSelect = false, hasTentative = false, confirmCount = 0;
                items.forEach(item => {
                    if (!item.planType || item.planType === '' || item.planType === 'Select') hasSelect = true;
                    else if (item.planType === 'Tentative') hasTentative = true;
                    else if (item.planType === 'Confirm') confirmCount++;
                });
                if (hasSelect) update[`${dept}PlanStatus`] = 'Pending';
                else if (hasTentative) update[`${dept}PlanStatus`] = 'Tentative';
                else if (confirmCount === items.length) update[`${dept}PlanStatus`] = 'Confirm';
                else update[`${dept}PlanStatus`] = 'Pending';
            }
        }
        if (Object.keys(update).length > 0) {
            statusOps.push({ updateOne: { filter: { orderNo: plan.orderNo }, update: { $set: update } } });
        }
    }
    if (statusOps.length > 0) {
        for (let i = 0; i < statusOps.length; i += 500) {
            await Order.bulkWrite(statusOps.slice(i, i + 500), { ordered: false });
        }
    }

    const count = await Order.countDocuments();
    console.log(`\nMIGRATION COMPLETE. Total Order documents: ${count}`);
    process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
