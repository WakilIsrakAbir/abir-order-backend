require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');
const OrderDate = require('./models/OrderDate');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log('Recalculating plan statuses...');
    
    const cursor = OrderDate.find({}, {
        orderNo: 1, knitting: 1, knittingStatus: 1, dyeing: 1, dyeingStatus: 1,
        finishing: 1, finishingStatus: 1, delivery: 1, deliveryStatus: 1, yd: 1, ydStatus: 1
    }).lean().cursor();

    let batch = [];
    let total = 0;

    for await (const plan of cursor) {
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
            batch.push({ updateOne: { filter: { orderNo: plan.orderNo }, update: { $set: update } } });
        }
        if (batch.length >= 100) {
            await Order.bulkWrite(batch, { ordered: false });
            total += batch.length;
            process.stdout.write(`\r  Updated ${total} orders...`);
            batch = [];
        }
    }
    if (batch.length > 0) {
        await Order.bulkWrite(batch, { ordered: false });
        total += batch.length;
    }

    console.log(`\nDone! ${total} orders updated with plan statuses.`);
    process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
