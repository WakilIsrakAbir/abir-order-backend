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
        const { page = 1, limit = 10, buyer = '', search = '', all = '' } = req.query;
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

        // Get confirmed orders from Order collection
        let query = Order.find(orderFilter, { orderNo: 1, buyer: 1, bookingDate: 1 }).sort({ orderNo: -1 });
        if (!noLimit) {
            query = query.skip(skip).limit(limitNum);
        }

        const [confirmedOrders, total] = await Promise.all([
            query.lean(),
            Order.countDocuments(orderFilter)
        ]);

        const orderNos = confirmedOrders.map(o => o.orderNo);

        // Fetch plan data only for this page's orders
        const planDocs = await OrderDate.find(
            { orderNo: { $in: orderNos } },
            { orderNo: 1, [dbDept]: 1, [`${dbDept}Status`]: 1, [`${dbDept}CompletedDate`]: 1, [`${dbDept}Actual`]: 1 }
        ).lean();

        // Pad missing OrderDate entries
        const planDocSet = new Set(planDocs.map(p => p.orderNo));
        orderNos.forEach(orderNo => {
            if (!planDocSet.has(orderNo)) {
                planDocs.push({ orderNo, [dbDept]: [] });
            }
        });

        // Build orderMap
        const orderMap = {};
        confirmedOrders.forEach(o => { orderMap[o.orderNo] = o; });

        // Get all buyers for filter tabs (from all confirmed orders, not just current page)
        const buyerFilter = { [statusField]: 'Confirm' };
        const allBuyers = await Order.distinct('buyer', buyerFilter);
        const buyers = [...new Set(allBuyers.filter(b => b && b.trim() !== '' && b !== 'N/A').map(b => b.trim().toUpperCase()))].sort();

        res.status(200).json({
            planDocs,
            orderMap,
            total,
            page: noLimit ? 1 : pageNum,
            limit: noLimit ? total : limitNum,
            totalPages: noLimit ? 1 : Math.ceil(total / limitNum),
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
            [statusField]: { $in: ['Confirm', 'Tentative'] }
        };

        const orders = await Order.find(filter, { orderNo: 1, buyer: 1 }).lean();
        const orderNos = orders.map(o => o.orderNo);

        if (orderNos.length === 0) {
            return res.status(404).json({ message: 'No data to export' });
        }

        // Fetch plan data only — itemData is stored inside plan items
        const planDocs = await OrderDate.find(
            { orderNo: { $in: orderNos }, [dept]: { $exists: true, $ne: [] } },
            { orderNo: 1, [dept]: 1 }
        ).lean();

        const orderBuyerMap = {};
        orders.forEach(o => { orderBuyerMap[o.orderNo] = o.buyer; });

        // Build rows for Excel
        let allRows = [];
        planDocs.forEach(plan => {
            const items = plan[dept] || [];
            items.forEach(item => {
                if (item.planType === 'Confirm' || item.planType === 'Tentative') {
                    let row = { ...(item.itemData || {}) };
                    row['OrderNo'] = plan.orderNo;
                    if (!row['Buyer']) row['Buyer'] = orderBuyerMap[plan.orderNo] || '';
                    row['Plan Start Date'] = item.startDate || '';
                    row['Plan End Date'] = item.endDate || '';
                    row['Plan Type'] = item.planType || '';
                    row['Limitation'] = item.limitation || '';
                    row['Remarks'] = item.remarks || '';
                    allRows.push(row);
                }
            });
        });

        if (allRows.length === 0) {
            return res.status(404).json({ message: 'No data to export' });
        }

        // Generate Excel
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(allRows);
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

module.exports = router;
