import React from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';

// Define a set of colors for the charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

// A custom label component for the pie chart to show percentages
const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.05) return null; // Don't render label if too small

    return (
        <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};

export const CostAnalyticsView = ({ costBySupplier, analyticsByCategory }) => {
    // Handle case where there is no data to display
    if (!costBySupplier.length && !Object.keys(analyticsByCategory).length) {
        return <p className="text-center text-zinc-400 py-8">No cost data available. Add stock with cost information to see analytics.</p>;
    }

    const sortedCostBySupplier = [...costBySupplier].sort((a, b) => b.value - a.value);

    return (
        <div className="flex flex-col lg:flex-row gap-8">
            {/* Main content area for charts */}
            <div className="w-full lg:w-2/3 space-y-8">
                {/* Cost by Supplier Pie Chart */}
                <div className="bg-zinc-800 rounded-2xl shadow-lg p-6 border border-zinc-700">
                    <h3 className="text-xl font-bold text-blue-400 mb-4">Total Cost by Supplier</h3>
                    <div style={{ width: '100%', height: 400 }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={costBySupplier} cx="50%" cy="50%" labelLine={false} label={renderCustomizedLabel} outerRadius={150} fill="#8884d8" dataKey="value" nameKey="name">
                                    {costBySupplier.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }} labelStyle={{ color: '#d4d4d8' }} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* NEW: Material Analytics Section by Category */}
                <div className="space-y-8">
                    <h3 className="text-xl font-bold text-blue-400">Sheets & Cost by Material</h3>
                    {Object.entries(analyticsByCategory).map(([category, materials]) => (
                        <div key={category} className="bg-zinc-800 rounded-2xl shadow-lg p-6 border border-zinc-700">
                            <h4 className="text-lg font-semibold text-zinc-300 mb-4">{category}</h4>
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer>
                                    <BarChart data={materials} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                                        <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fontSize: 12 }} />
                                        <YAxis stroke="#a1a1aa" />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.5rem' }}
                                            labelStyle={{ color: '#d4d4d8' }}
                                            formatter={(value, name) => [name === 'quantity' ? value : `$${value.toFixed(2)}`, name]}
                                        />
                                        <Legend />
                                        <Bar dataKey="quantity" name="Sheets" fill="#00C49F">
                                            <LabelList
                                                dataKey="cost"
                                                position="top"
                                                fill="#FFBB28"
                                                fontSize={12}
                                                formatter={(value) => value > 0 ? `$${Math.round(value)}` : ''}
                                            />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Sidebar for detailed cost breakdown */}
            <div className="w-full lg:w-1/3">
                <div className="bg-zinc-800 rounded-2xl shadow-lg p-6 border border-zinc-700 sticky top-8">
                    <h3 className="text-xl font-bold text-blue-400 mb-4">Supplier Cost Breakdown</h3>
                    {sortedCostBySupplier.length > 0 ? (
                        <ul className="space-y-3 max-h-[80vh] overflow-y-auto">
                            {sortedCostBySupplier.map((supplier, index) => (
                                <li key={index} className="flex justify-between items-center bg-zinc-700/50 p-3 rounded-lg">
                                    <div className="flex items-center">
                                        <span className="w-4 h-4 rounded-full mr-3" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                        <span className="font-medium text-zinc-300">{supplier.name}</span>
                                    </div>
                                    <span className="font-mono text-green-400">
                                        ${supplier.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-zinc-400">No supplier cost data to display.</p>
                    )}
                </div>
            </div>
        </div>
    );
};