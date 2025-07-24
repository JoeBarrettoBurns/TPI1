const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// --- Server Configuration ---
const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Database Connection ---
// IMPORTANT: Replace this with your actual MongoDB connection string.
const mongoURI = 'mongodb://localhost:27017/tecnopan-inventory';

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB successfully connected...'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- API Routes ---
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/logs', require('./routes/Logs'));

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});
