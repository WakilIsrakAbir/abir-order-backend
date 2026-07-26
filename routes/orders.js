const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const OrderDate = require('../models/OrderDate');

// ==========================================================
// ORDERS API: Fast paginated endpoints for frontend
// ==========================================================

// ==========================================
// GET /api/orders/all-list — All orders (for Order Status page)
// No department filter, returns all orders with pagination + search
// ==========================================
router.get('/all-list', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const filter = {};
        if (search) {
            filter.$or = [
                { orderNo: { $regex: search, $options: 'i' } },
                { buyer: { $regex: search, $options: 'i' } }
            ];
        }

        const projection = { orderNo: 1, buyer: 1, bookingDate: 1, status: 1 };

        const [orders, total] = await Promise.all([
            Order.find(filter, projection).sort({ orderNo: -1 }).skip(skip).limit(limitNum).lean(),
            Order.countDocuments(filter)
        ]);

        res.status(200).json({
            orders,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (error) {
        console.error('Error fetching all-list:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// GET /api/orders — Paginated order list for a department
// Query params: dept, status, buyer, page, limit, search
// ==========================================
router.get('/', async (req, res) => {
    try {
        const {
            dept = 'knitting',
            status = 'Pending',  // Pending | Confirm | Tentative | Completed
            buyer = '',
            page = 1,
            limit = 10,
            search = ''
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        // Build filter
        const filter = {};

        // Department plan status filter
        const statusField = `${dept}PlanStatus`;
        if (status === 'Completed') {
            filter[statusField] = 'Completed';
        } else {
            filter[statusField] = status;
        }

        // Buyer filter
        if (buyer) {
            filter.buyer = { $regex: buyer, $options: 'i' };
        }

        // Search by orderNo
        if (search) {
            filter.orderNo = { $regex: search, $options: 'i' };
        }

        // Only return orders that have items for this department
        const itemsField = `${dept}Items`;
        filter[itemsField] = { $exists: true, $ne: [] };

        // Projection: only return what the list view needs (not full item arrays)
        const projection = {
            orderNo: 1,
            buyer: 1,
            bookingDate: 1,
            status: 1,
            requiredQtyKgs: 1,
            [`${dept}PlanStatus`]: 1
        };

        const [orders, total] = await Promise.all([
            Order.find(filter, projection)
                .sort({ orderNo: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Order.countDocuments(filter)
        ]);

        // Get unique buyers for buyer filter tabs (from all orders matching dept+status)
        const buyerFilter = { ...filter };
        delete buyerFilter.buyer; // Remove buyer filter to get all buyers
        delete buyerFilter.orderNo; // Remove search filter
        const buyersList = await Order.distinct('buyer', buyerFilter);

        res.status(200).json({
            orders,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            buyers: [...new Set(buyersList.filter(b => b && b.trim() !== '' && b !== 'N/A').map(b => b.trim().toUpperCase()))].sort()
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// GET /api/orders/:orderNo — Single order full detail
// Query params: dept (to know which items to include)
// ==========================================
router.get('/:orderNo', async (req, res) => {
    try {
        const { orderNo } = req.params;
        const { dept = 'knitting' } = req.query;

        // Get order data
        const order = await Order.findOne({ orderNo }).lean();
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Get saved plan data from OrderDate
        const planData = await OrderDate.findOne({ orderNo }).lean();

        res.status(200).json({
            order,
            planData: planData || null
        });
    } catch (error) {
        console.error('Error fetching order detail:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// GET /api/orders/buyers/:dept — Get all buyers for a department
// ==========================================
router.get('/buyers/:dept', async (req, res) => {
    try {
        const { dept } = req.params;
        const itemsField = `${dept}Items`;

        const buyers = await Order.distinct('buyer', {
            [itemsField]: { $exists: true, $ne: [] }
        });

        res.status(200).json(
            buyers.filter(b => b && b !== 'N/A' && b !== '').sort()
        );
    } catch (error) {
        console.error('Error fetching buyers:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// GET /api/orders/report/:dept — Report data (Confirm + Tentative orders with full items)
// Query params: page, limit
// ==========================================
router.get('/report/:dept', async (req, res) => {
    try {
        const { dept } = req.params;

        const statusField = `${dept}PlanStatus`;
        const itemsField = `${dept}Items`;

        const filter = {
            [statusField]: { $in: ['Confirm', 'Tentative'] },
            [itemsField]: { $exists: true, $ne: [] }
        };

        // No limit — fetch ALL confirmed/tentative orders for report
        const orders = await Order.find(filter).sort({ orderNo: -1 }).lean();
        const total = orders.length;

        // Also get plan data for these orders
        const orderNos = orders.map(o => o.orderNo);
        const planDocs = await OrderDate.find(
            { orderNo: { $in: orderNos } }
        ).lean();

        const planMap = {};
        planDocs.forEach(p => { planMap[p.orderNo] = p; });

        res.status(200).json({
            orders,
            planMap,
            total
        });
    } catch (error) {
        console.error('Error fetching report:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// GET /api/orders/tracking/:dept — Actual tracking data (confirmed plans)
// Returns orders with confirmed plans for tracking page
// ==========================================
router.get('/tracking/:dept', async (req, res) => {
    try {
        const { dept } = req.params;
        const { page = 1, limit = 10, buyer = '', search = '', all = '', status = '' } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.max(1, parseInt(limit) || 10);
        const noLimit = all === 'true' || parseInt(limit) === 0; // all=true OR limit=0 means no limit
        const skip = noLimit ? 0 : (pageNum - 1) * limitNum;

        const dbDept = dept === 'deliveryfloor' ? 'delivery' : dept;
        const statusField = `${dbDept}PlanStatus`;

        // Build filter for Order collection
        const orderFilter = { [statusField]: 'Confirm' };
        if (buyer) orderFilter.buyer = { $regex: buyer, $options: 'i' };
        if (search) orderFilter.orderNo = { $regex: search, $options: 'i' };

        // Get ALL confirmed orders (no pagination at DB level — filter by status after)
        const confirmedOrders = await Order.find(orderFilter, { orderNo: 1, buyer: 1, bookingDate: 1 })
            .sort({ orderNo: -1 }).lean();

        const orderNos = confirmedOrders.map(o => o.orderNo);

        if (orderNos.length === 0) {
            return res.status(200).json({ planDocs: [], orderMap: {}, total: 0, page: 1, limit: limitNum, totalPages: 0, buyers: [] });
        }

        const trackingOrderNos = confirmedOrders.map(o => o.orderNo);

        // Fetch plan data only for this page's orders
        const planDocs = await OrderDate.find(
            { orderNo: { $in: trackingOrderNos } },
            { orderNo: 1, [dbDept]: 1, [`${dbDept}Status`]: 1, [`${dbDept}CompletedDate`]: 1, [`${dbDept}Actual`]: 1 }
        ).lean();

        // Pad missing OrderDate entries
        const planDocSet = new Set(planDocs.map(p => p.orderNo));
        trackingOrderNos.forEach(orderNo => {
            if (!planDocSet.has(orderNo)) {
                planDocs.push({ orderNo, [dbDept]: [] });
            }
        });

        // Filter by Pending/Complete status (based on actualEnd in OrderDate)
        const actualField = (dept === 'deliveryfloor' ? 'delivery' : dept) + 'Actual';
        let filteredPlanDocs = planDocs;
        if (status === 'Pending' || status === 'Complete') {
            filteredPlanDocs = planDocs.filter(plan => {
                const actual = plan[actualField];
                const hasActualEnd = actual && actual.actualEnd && actual.actualEnd.trim() !== '';
                if (status === 'Pending') return !hasActualEnd;
                if (status === 'Complete') return hasActualEnd;
                return true;
            });
        }

        // Build orderMap
        const orderMap = {};
        confirmedOrders.forEach(o => { orderMap[o.orderNo] = o; });

        // Get all buyers for filter tabs (from all confirmed orders, not just current page)
        const buyerFilter = { [statusField]: 'Confirm' };
        const allBuyers = await Order.distinct('buyer', buyerFilter);
        const buyers = [...new Set(allBuyers.filter(b => b && b.trim() !== '' && b !== 'N/A').map(b => b.trim().toUpperCase()))].sort();

        // Paginate the filtered results
        const totalFiltered = filteredPlanDocs.length;
        const paginatedDocs = noLimit ? filteredPlanDocs : filteredPlanDocs.slice(skip, skip + limitNum);

        res.status(200).json({
            planDocs: paginatedDocs,
            orderMap,
            total: totalFiltered,
            page: noLimit ? 1 : pageNum,
            limit: noLimit ? totalFiltered : limitNum,
            totalPages: noLimit ? 1 : Math.ceil(totalFiltered / limitNum),
            buyers
        });
    } catch (error) {
        console.error('Error fetching tracking:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// GET /api/orders/report-download/:dept — Generate and download Excel report directly
// Uses projection to minimize data loaded from MongoDB
// ==========================================
router.get('/report-download/:dept', async (req, res) => {
    try {
        const XLSX = require('xlsx');
        const { dept } = req.params;

        const statusField = `${dept}PlanStatus`;
        const itemsField = `${dept}Items`;

        // Only fetch orderNo (minimal projection) — plan data has itemData already
        const filter = {
            [statusField]: { $in: ['Pending', 'Confirm', 'Tentative'] }
        };

        const orders = await Order.find(filter, { orderNo: 1, buyer: 1 }).lean();
        const orderNos = orders.map(o => o.orderNo);

        if (orderNos.length === 0) {
            return res.status(404).json({ message: 'No data to export' });
        }

        // Fetch plan data — for delivery, also fetch knitting and dyeing plans
        let planProjection = { orderNo: 1, [dept]: 1 };
        if (dept === 'delivery') {
            planProjection.knitting = 1;
            planProjection.dyeing = 1;
        }

        const planDocs = await OrderDate.find(
            { orderNo: { $in: orderNos }, [dept]: { $exists: true, $ne: [] } },
            planProjection
        ).lean();

        const orderBuyerMap = {};
        orders.forEach(o => { orderBuyerMap[o.orderNo] = o.buyer; });

        // Build rows for Excel
        let allRows = [];
        planDocs.forEach(plan => {
            const items = plan[dept] || [];
            items.forEach(item => {
                // Include all items (Pending, Confirm, Tentative)
                {
                    let row = { ...(item.itemData || {}) };
                    row['OrderNo'] = plan.orderNo;
                    if (!row['Buyer']) row['Buyer'] = orderBuyerMap[plan.orderNo] || '';

                    if (dept === 'delivery') {
                        // Include knitting plan dates (matched by Color + FabricConstruction + GSM)
                        let knitStart = '', knitEnd = '', knitType = '';
                        let dyeStart = '', dyeEnd = '', dyeType = '';

                        const myColor = String(row.Color || '').trim().toLowerCase();
                        const myConst = String(row.FabricConstruction || '').trim().toLowerCase();
                        const myGSM = String(row.GSM || '').trim().toLowerCase();

                        if (plan.knitting && Array.isArray(plan.knitting)) {
                            const kItem = plan.knitting.find(k => k.itemData &&
                                String(k.itemData.Color || '').trim().toLowerCase() === myColor &&
                                String(k.itemData.FabricConstruction || '').trim().toLowerCase() === myConst &&
                                String(k.itemData.GSM || '').trim().toLowerCase() === myGSM);
                            if (kItem) {
                                knitStart = kItem.startDate || '';
                                knitEnd = kItem.endDate || '';
                                knitType = kItem.planType || '';
                            }
                        }

                        if (plan.dyeing && Array.isArray(plan.dyeing)) {
                            const dItem = plan.dyeing.find(d => d.itemData &&
                                String(d.itemData.Color || '').trim().toLowerCase() === myColor);
                            if (dItem) {
                                dyeStart = dItem.startDate || '';
                                dyeEnd = dItem.endDate || '';
                                dyeType = dItem.planType || '';
                            }
                        }

                        row['Knit Start Date'] = knitStart;
                        row['Knit End Date'] = knitEnd;
                        row['Knit Plan Type'] = knitType;
                        row['Dyeing Start Date'] = dyeStart;
                        row['Dyeing End Date'] = dyeEnd;
                        row['Dyeing Plan Type'] = dyeType;
                        row['Delivery Plan Start'] = item.startDate || '';
                        row['Delivery Plan End'] = item.endDate || '';
                        row['Delivery Plan Type'] = item.planType || '';
                        row['Delivery Plan Start (Floor)'] = item.floorStartDate || '';
                        row['Delivery Plan End (Floor)'] = item.floorEndDate || '';
                        row['Delivery Plan Type (Floor)'] = item.floorPlanType || '';
                        row['Limitation'] = item.limitation || '';
                        row['Remarks'] = item.remarks || '';
                    } else {
                        row['Plan Start Date'] = item.startDate || '';
                        row['Plan End Date'] = item.endDate || '';
                        row['Plan Type'] = item.planType || '';
                        row['Limitation'] = item.limitation || '';
                        row['Remarks'] = item.remarks || '';
                    }

                    allRows.push(row);
                }
            });
        });

        // Also include orders with items but no plan saved yet (pure Pending)
        const planDocOrderNos = new Set(planDocs.map(p => p.orderNo));
        for (const order of orders) {
            if (!planDocOrderNos.has(order.orderNo)) {
                // This order has dept items but no plan — include with empty dates
                const items = await Order.findOne({ orderNo: order.orderNo }, { [`${dept}Items`]: 1 }).lean();
                if (items && items[`${dept}Items`]) {
                    items[`${dept}Items`].forEach(itemData => {
                        let row = { ...itemData };
                        row['OrderNo'] = order.orderNo;
                        if (!row['Buyer']) row['Buyer'] = order.buyer || '';
                        if (dept === 'delivery') {
                            row['Knit Start Date'] = '';
                            row['Knit End Date'] = '';
                            row['Knit Plan Type'] = '';
                            row['Dyeing Start Date'] = '';
                            row['Dyeing End Date'] = '';
                            row['Dyeing Plan Type'] = '';
                            row['Delivery Plan Start'] = '';
                            row['Delivery Plan End'] = '';
                            row['Delivery Plan Type'] = '';
                            row['Delivery Plan Start (Floor)'] = '';
                            row['Delivery Plan End (Floor)'] = '';
                            row['Delivery Plan Type (Floor)'] = '';
                            row['Limitation'] = '';
                            row['Remarks'] = '';
                        } else {
                            row['Plan Start Date'] = '';
                            row['Plan End Date'] = '';
                            row['Plan Type'] = '';
                            row['Limitation'] = '';
                            row['Remarks'] = '';
                        }
                        allRows.push(row);
                    });
                }
            }
        }

        if (allRows.length === 0) {
            return res.status(404).json({ message: 'No data to export' });
        }

        // Generate Excel with proper date formatting
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(allRows);

        // Convert date strings to Excel date numbers
        if (ws['!ref']) {
            const range = XLSX.utils.decode_range(ws['!ref']);
            const headers = [];
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
                headers[C] = cell ? String(cell.v).toLowerCase() : '';
            }

            for (let R = 1; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const h = headers[C];
                    const isDateCol = h.includes('date') || h.includes('start') || h.includes('end');
                    if (!isDateCol) continue;

                    const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                    const cell = ws[cellRef];
                    if (!cell || !cell.v || cell.v === '' || cell.v === 'N/A' || cell.v === '-') continue;

                    const d = new Date(cell.v);
                    if (!isNaN(d.getTime())) {
                        // Convert to Excel serial date number
                        const excelDate = (d.getTime() / 86400000) + 25569;
                        cell.t = 'n';
                        cell.v = excelDate;
                        cell.z = 'dd/mm/yyyy';
                    }
                }
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, `${dept}_Report`);

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const dateStr = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${dept.toUpperCase()}_Report_${dateStr}.xlsx"`);
        res.send(buf);

    } catch (error) {
        console.error('Report download error:', error);
        res.status(500).json({ message: 'Error generating report' });
    }
});

// ==========================================
// GET /api/orders/tracking-download/:dept — Download tracking report as Excel
// Generates Excel with ALL confirmed orders for the department
// ==========================================
router.get('/tracking-download/:dept', async (req, res) => {
    try {
        const XLSX = require('xlsx');
        const { dept } = req.params;
        const { status = 'Pending' } = req.query; // 'Pending' or 'Complete'

        const dbDept = dept === 'deliveryfloor' ? 'delivery' : dept;
        const statusField = `${dbDept}PlanStatus`;

        // Get all confirmed orders
        const confirmedOrders = await Order.find(
            { [statusField]: 'Confirm' },
            { orderNo: 1, buyer: 1, bookingDate: 1 }
        ).lean();

        const orderNos = confirmedOrders.map(o => o.orderNo);
        const orderMap = {};
        confirmedOrders.forEach(o => { orderMap[o.orderNo] = o; });

        // Get plan data
        const planDocs = await OrderDate.find(
            { orderNo: { $in: orderNos } },
            { orderNo: 1, [dbDept]: 1, [`${dbDept}Actual`]: 1 }
        ).lean();

        // Build tracking rows
        let rows = [];
        
        // Process OrderDate docs
        const processedOrderNos = new Set();
        planDocs.forEach(plan => {
            processedOrderNos.add(plan.orderNo);
            const deptItems = plan[dbDept] || [];
            const orderInfo = orderMap[plan.orderNo] || {};

            let planStart = '', planEnd = '';
            if (deptItems.length > 0) {
                if (dept === 'deliveryfloor') {
                    const floorItems = deptItems.filter(i => i.floorPlanType === 'Confirm' || i.floorPlanType === 'Tentative');
                    const starts = floorItems.map(i => i.floorStartDate).filter(d => d && d !== '');
                    const ends = floorItems.map(i => i.floorEndDate).filter(d => d && d !== '');
                    if (starts.length) { starts.sort(); planStart = starts[0]; }
                    if (ends.length) { ends.sort(); planEnd = ends[ends.length - 1]; }
                } else {
                    const starts = deptItems.map(i => i.startDate).filter(d => d && d !== '');
                    const ends = deptItems.map(i => i.endDate).filter(d => d && d !== '');
                    if (starts.length) { starts.sort(); planStart = starts[0]; }
                    if (ends.length) { ends.sort(); planEnd = ends[ends.length - 1]; }
                }
            }

            const actualKey = (dept === 'deliveryfloor' ? 'delivery' : dept) + 'Actual';
            let actualStart = '', actualEnd = '', failReason = '', relatedDept = '';
            if (plan[actualKey]) {
                actualStart = plan[actualKey].actualStart || '';
                actualEnd = plan[actualKey].actualEnd || '';
                failReason = plan[actualKey].failReason || '';
                relatedDept = plan[actualKey].relatedDept || '';
            }

            // Filter by status (Pending = no actualEnd, Complete = has actualEnd with real date)
            const hasActualEnd = actualEnd && actualEnd.trim() !== '' && actualEnd !== '-';
            if (status === 'Pending' && hasActualEnd) return;
            if (status === 'Complete' && !hasActualEnd) return;

            // Compute pass/fail
            let startResult = '—', endResult = '—';
            if (actualStart && planStart) {
                startResult = new Date(actualStart) <= new Date(planStart) ? 'Pass' : 'Fail';
            }
            if (actualEnd && planEnd) {
                endResult = new Date(actualEnd) <= new Date(planEnd) ? 'Pass' : 'Fail';
            }

            rows.push({
                'Order/Booking No.': plan.orderNo,
                'Buyer': orderInfo.buyer || '',
                'Plan Start': planStart,
                'Plan End': planEnd,
                'Actual Start': actualStart,
                'Actual End': actualEnd,
                'Start Result': startResult,
                'End Result': endResult,
                'Fail Reason': failReason,
                'Related Dept.': relatedDept
            });
        });

        // Add orders without OrderDate docs
        orderNos.forEach(orderNo => {
            if (!processedOrderNos.has(orderNo)) {
                const orderInfo = orderMap[orderNo] || {};
                if (status === 'Complete') return; // No actual data = pending
                rows.push({
                    'Order/Booking No.': orderNo,
                    'Buyer': orderInfo.buyer || '',
                    'Plan Start': '',
                    'Plan End': '',
                    'Actual Start': '',
                    'Actual End': '',
                    'Start Result': '—',
                    'End Result': '—',
                    'Fail Reason': '',
                    'Related Dept.': ''
                });
            }
        });

        if (rows.length === 0) {
            return res.status(404).json({ message: 'No data to export' });
        }

        // Add SL column
        rows.forEach((r, i) => { r['SL'] = i + 1; });
        // Reorder columns
        const orderedRows = rows.map(r => ({
            'SL': r['SL'],
            'Order/Booking No.': r['Order/Booking No.'],
            'Buyer': r['Buyer'],
            'Plan Start': r['Plan Start'],
            'Plan End': r['Plan End'],
            'Actual Start': r['Actual Start'],
            'Actual End': r['Actual End'],
            'Start Result': r['Start Result'],
            'End Result': r['End Result'],
            'Fail Reason': r['Fail Reason'],
            'Related Dept.': r['Related Dept.']
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(orderedRows);
        XLSX.utils.book_append_sheet(wb, ws, 'Report');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const deptName = dept.charAt(0).toUpperCase() + dept.slice(1);
        const dateStr = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${deptName}_${status}_Tracking_Report_${dateStr}.xlsx"`);
        res.send(buf);

    } catch (error) {
        console.error('Tracking download error:', error);
        res.status(500).json({ message: 'Error generating report' });
    }
});

module.exports = router;
