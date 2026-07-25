const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const OrderDate = require('../models/OrderDate');

// ==========================================================
// ORDERS API: Fast paginated endpoints for frontend
// ==========================================================

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
            buyers: buyersList.filter(b => b && b !== 'N/A' && b !== '').sort()
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
        const { page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const statusField = `${dept}PlanStatus`;
        const itemsField = `${dept}Items`;

        const filter = {
            [statusField]: { $in: ['Confirm', 'Tentative'] },
            [itemsField]: { $exists: true, $ne: [] }
        };

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .sort({ orderNo: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Order.countDocuments(filter)
        ]);

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
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
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
        const { page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const dbDept = dept === 'deliveryfloor' ? 'delivery' : dept;

        // Find OrderDate docs that have confirmed plans for this dept
        const deptFilter = {};
        if (dept === 'deliveryfloor') {
            // Floor plans: items with floorPlanType = Confirm or Tentative
            deptFilter[dbDept] = { $exists: true, $ne: [] };
        } else {
            deptFilter[dbDept] = { $exists: true, $ne: [] };
        }

        const [planDocs, total] = await Promise.all([
            OrderDate.find(deptFilter, {
                orderNo: 1,
                [dbDept]: 1,
                [`${dbDept}Status`]: 1,
                [`${dbDept}CompletedDate`]: 1,
                [`${dbDept}Actual`]: 1
            }).skip(skip).limit(limitNum).lean(),
            OrderDate.countDocuments(deptFilter)
        ]);

        // Get matching Order docs for buyer/bookingDate info
        const orderNos = planDocs.map(p => p.orderNo);
        const orderDocs = await Order.find(
            { orderNo: { $in: orderNos } },
            { orderNo: 1, buyer: 1, bookingDate: 1 }
        ).lean();

        const orderMap = {};
        orderDocs.forEach(o => { orderMap[o.orderNo] = o; });

        res.status(200).json({
            planDocs,
            orderMap,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (error) {
        console.error('Error fetching tracking:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
