// src/components/assistant/AIAssistant.jsx

import React, { useState, useRef, useEffect } from 'react';
import { Bot, User, CornerDownLeft, Loader, X } from 'lucide-react';
import { Button } from '../common/Button';

// This is the main component for the AI Assistant chat window.
export const AIAssistant = ({ isVisible, onClose, inventory, materials, suppliers, usageLog }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // This effect ensures the chat window automatically scrolls to the latest message.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // This function constructs the detailed prompt to send to the AI model.
    // It includes context about the application and the current inventory data.
    const constructPrompt = (userInput) => {
        // Intelligently filter the full inventory based on keywords in the user's input.
        const lowerUserInput = userInput.toLowerCase();
        const keywords = lowerUserInput.match(/\b(\w+)\b/g) || [];

        let relevantInventory = inventory;

        // If specific material keywords are present, filter by them.
        const materialKeywords = Object.keys(materials).flatMap(m => m.toLowerCase().split(/[\s-/]+/)).filter(k => k.length > 2);
        const mentionedKeywords = keywords.filter(kw => materialKeywords.includes(kw));

        if (mentionedKeywords.length > 0) {
            relevantInventory = inventory.filter(item => {
                const itemMaterial = item.materialType.toLowerCase();
                return mentionedKeywords.some(kw => itemMaterial.includes(kw));
            });
        }

        // Use a smaller slice of the full log as a general context.
        const relevantUsageLog = usageLog.slice(0, 20);

        const inventoryContext = `
            Here is the relevant inventory data based on the user's query:
            ${JSON.stringify(relevantInventory.slice(0, 100), null, 2)}

            Here are the available materials and their properties:
            ${JSON.stringify(materials, null, 2)}

            Here are the available suppliers:
            ${JSON.stringify(suppliers, null, 2)}

            Here is a summary of recent usage:
            ${JSON.stringify(relevantUsageLog, null, 2)}
        `;

        return `You are an advanced inventory analyst for the TecnoPan system.
        Your name is 'The Analyst'.
        Your primary function is to provide direct, data-driven answers based on the provided inventory data.
        Be concise and professional. Avoid conversational filler.
        If you are asked to perform an action (e.g., creating an order), state that you lack the capability to perform actions and can only provide data.
        Analyze the provided data carefully to answer the user's query.

        Current Data Context:
        ${inventoryContext}

        User's query: "${userInput}"
        `;
    };

    // This function handles the submission of a user's message.
    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage = { sender: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        const fullPrompt = constructPrompt(input);

        // --- Gemini API Call ---
        try {
            let chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: fullPrompt }] });
            const payload = { contents: chatHistory };
            const apiKey = "AIzaSyBh-vdczQi_lBy51bBdOrYviQTeP3ttquM" // Your provided API key.
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const result = await response.json();

            let aiResponseText = "Could not process the request.";
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                aiResponseText = result.candidates[0].content.parts[0].text;
            }

            const aiMessage = { sender: 'ai', text: aiResponseText };
            setMessages(prev => [...prev, aiMessage]);

        } catch (error) {
            console.error("Error calling Gemini API:", error);
            const errorMessage = { sender: 'ai', text: `Error: ${error.message}` };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-4 right-4 w-full max-w-lg h-3/4 bg-zinc-800 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col z-50">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-900/50 rounded-t-2xl">
                <div className="flex items-center gap-3">
                    <Bot className="text-blue-400" />
                    <h3 className="text-lg font-bold text-white">Inventory Analyst</h3>
                </div>
                <button onClick={onClose} className="text-zinc-400 hover:text-white">
                    <X size={24} />
                </button>
            </div>

            {/* Message Area */}
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

            {/* Input Area */}
            <div className="p-4 border-t border-zinc-700 bg-zinc-900/50 rounded-b-2xl">
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()}
                        placeholder="Query inventory data..."
                        className="w-full p-3 pr-12 bg-zinc-700 border border-zinc-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isLoading}
                    />
                    <Button
                        onClick={handleSend}
                        disabled={isLoading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 !p-2"
                        variant="primary"
                    >
                        <CornerDownLeft size={20} />
                    </Button>
                </div>
            </div>
        </div>
    );
};