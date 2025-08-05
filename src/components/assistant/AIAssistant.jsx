import React, { useState, useRef, useEffect } from 'react';
import { Bot, User, CornerDownLeft, Loader, X, PlusCircle } from 'lucide-react';
import { Button } from '../common/Button';

// This is the main component for the AI Assistant chat window.
export const AIAssistant = ({ isVisible, onClose, inventory, materials, suppliers, usageLog, onExecuteOrder, onOpenModal }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [orderToConfirm, setOrderToConfirm] = useState(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isVisible) {
            setMessages([]);
            setOrderToConfirm(null);
            setInput('');
        }
    }, [isVisible]);

    const handleNewChat = () => {
        setMessages([]);
        setOrderToConfirm(null);
        setInput('');
    };

    const constructPrompt = (userInput) => {
        const inventoryContext = `
            Here is the relevant inventory data based on the user's query:
            ${JSON.stringify(inventory.slice(0, 50), null, 2)}
            Here are the available materials and their properties:
            ${JSON.stringify(materials, null, 2)}
        `;

        return `You are an advanced inventory analyst and assistant for the TecnoPan system.
        Your name is 'The Analyst'.
        Your primary function is to provide direct, data-driven answers and to help the user perform actions like creating orders or opening forms.
        
        Available Actions:
        - "create_order": Use when the user wants to order new stock.
        - "open_use_stock_modal": Use when the user wants to log using stock for a job.
        - "open_add_category_modal": Use when the user wants to create a new material category.
        - "open_manage_suppliers_modal": Use when the user wants to add or view suppliers.
        - "answer_question": Use for any other general query about inventory or data.

        - For "create_order", you MUST use a supplier from the provided list of available suppliers. If the user provides a name that is similar to an existing supplier, use the existing one (e.g., if the user says "ryerson", you must use "RYERSON"). Do not create new suppliers.
        - You MUST gather all required details (material, quantity, supplier, cost) by asking follow-up questions if necessary before presenting the final order for confirmation.
        - If the user doesn't specify an arrival date for an "Ordered" status, assume today's date: ${new Date().toISOString().split('T')[0]}.
        - If the user doesn't specify a job name, use "Stock".

        Available Suppliers:
        ${JSON.stringify(suppliers)}

        Current Data Context:
        ${inventoryContext}
        `;
    };

    const constructPayload = (currentMessages, userInput) => {
        const systemPrompt = constructPrompt(userInput);

        const history = currentMessages.map(msg => ({
            role: msg.sender === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        }));

        history.push({ role: 'user', parts: [{ text: userInput }] });

        return {
            contents: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                { role: 'model', parts: [{ text: "Understood. I am ready to assist." }] },
                ...history
            ]
        };
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = { sender: 'user', text: input };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);
        setOrderToConfirm(null);

        const payload = constructPayload(messages, input);

        const generationConfig = {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    action: {
                        type: "STRING",
                        enum: [
                            "create_order",
                            "answer_question",
                            "open_use_stock_modal",
                            "open_add_category_modal",
                            "open_manage_suppliers_modal"
                        ]
                    },
                    order: {
                        type: "OBJECT",
                        nullable: true,
                        properties: {
                            jobName: { type: "STRING" },
                            supplier: { type: "STRING", enum: suppliers },
                            status: { type: "STRING", enum: ["Ordered", "On Hand"] },
                            arrivalDate: { type: "STRING" },
                            items: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        materialType: { type: "STRING" },
                                        qty96: { type: "NUMBER" },
                                        qty120: { type: "NUMBER" },
                                        qty144: { type: "NUMBER" },
                                        costPerPound: { type: "NUMBER" }
                                    },
                                    required: ["materialType", "costPerPound"]
                                }
                            }
                        },
                    },
                    responseText: { type: "STRING" }
                },
                required: ["action", "responseText"]
            }
        };

        try {
            const finalPayload = { ...payload, generationConfig };
            const apiKey = "AIzaSyBh-vdczQi_lBy51bBdOrYviQTeP3ttquM";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);

            const result = await response.json();
            const part = result.candidates?.[0]?.content?.parts?.[0];
            const jsonText = part?.text;

            if (jsonText) {
                const parsedResponse = JSON.parse(jsonText);
                const aiMessage = { sender: 'ai', text: parsedResponse.responseText };
                setMessages(prev => [...prev, aiMessage]);

                if (parsedResponse.action === 'create_order' && parsedResponse.order) {
                    setOrderToConfirm(parsedResponse.order);
                } else if (parsedResponse.action === 'open_use_stock_modal') {
                    onOpenModal('use');
                } else if (parsedResponse.action === 'open_add_category_modal') {
                    onOpenModal('add-category');
                } else if (parsedResponse.action === 'open_manage_suppliers_modal') {
                    onOpenModal('manage-suppliers');
                }

            } else {
                throw new Error("Invalid response structure from API.");
            }

        } catch (error) {
            console.error("Error calling Gemini API:", error);
            const errorMessage = { sender: 'ai', text: `Error: ${error.message}` };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmOrder = async () => {
        if (!orderToConfirm) return;
        setIsLoading(true);
        try {
            await onExecuteOrder([orderToConfirm]);
            const successMessage = { sender: 'ai', text: "Order created successfully!" };
            setMessages(prev => [...prev, successMessage]);
        } catch (error) {
            console.error("Error executing order:", error);
            const errorMessage = { sender: 'ai', text: `Failed to create order: ${error.message}` };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setOrderToConfirm(null);
            setIsLoading(false);
        }
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-4 right-4 w-full max-w-lg h-3/4 bg-zinc-800 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col z-50">
            <div className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-900/50 rounded-t-2xl">
                <div className="flex items-center gap-3">
                    <Bot className="text-blue-400" />
                    <h3 className="text-lg font-bold text-white">Inventory Analyst</h3>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleNewChat} title="New Chat" className="text-zinc-400 hover:text-white p-1 rounded-full hover:bg-zinc-700">
                        <PlusCircle size={20} />
                    </button>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded-full hover:bg-zinc-700">
                        <X size={24} />
                    </button>
                </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                        {msg.sender === 'ai' && <Bot className="text-blue-400 mt-1 shrink-0" />}
                        <div className={`max-w-md p-3 rounded-xl ${msg.sender === 'ai' ? 'bg-zinc-700 text-zinc-200' : 'bg-blue-800 text-white'}`}>
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                        {msg.sender === 'user' && <User className="text-zinc-400 mt-1 shrink-0" />}
                    </div>
                ))}
                {orderToConfirm && (
                    <div className="flex items-start gap-3">
                        <Bot className="text-blue-400 mt-1 shrink-0" />
                        <div className="max-w-md p-3 rounded-xl bg-zinc-700 text-zinc-200 space-y-3">
                            <p className="font-bold">Please confirm the order details:</p>
                            <ul className="text-sm list-disc list-inside">
                                <li><strong>Supplier:</strong> {orderToConfirm.supplier}</li>
                                <li><strong>Job/PO:</strong> {orderToConfirm.jobName}</li>
                                <li><strong>Status:</strong> {orderToConfirm.status}</li>
                                {orderToConfirm.arrivalDate && <li><strong>Arrival:</strong> {orderToConfirm.arrivalDate}</li>}
                                {orderToConfirm.items.map((item, i) => (
                                    <li key={i} className="mt-2 pl-2 border-l border-zinc-600">
                                        <strong>{item.materialType}</strong>
                                        <ul className="text-xs list-disc list-inside pl-4">
                                            {item.qty96 > 0 && <li>96" Sheets: {item.qty96}</li>}
                                            {item.qty120 > 0 && <li>120" Sheets: {item.qty120}</li>}
                                            {item.qty144 > 0 && <li>144" Sheets: {item.qty144}</li>}
                                            <li>Cost/lb: ${item.costPerPound}</li>
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                            <div className="flex gap-2 pt-2">
                                <Button onClick={handleConfirmOrder} variant="success" className="w-full">Confirm</Button>
                                <Button onClick={() => setOrderToConfirm(null)} variant="danger" className="w-full">Cancel</Button>
                            </div>
                        </div>
                    </div>
                )}
                {isLoading && (
                    <div className="flex items-start gap-3">
                        <Bot className="text-blue-400 mt-1 shrink-0" />
                        <div className="max-w-md p-3 rounded-xl bg-zinc-700 text-zinc-200">
                            <Loader className="animate-spin" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-zinc-700 bg-zinc-900/50 rounded-b-2xl">
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()}
                        placeholder="Query inventory or create an order..."
                        className="w-full p-3 pr-12 bg-zinc-700 border border-zinc-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isLoading}
                    />
                    <Button onClick={handleSend} disabled={isLoading} className="absolute right-2 top-1/2 -translate-y-1/2 !p-2" variant="primary">
                        <CornerDownLeft size={20} />
                    </Button>
                </div>
            </div>
        </div>
    );
};