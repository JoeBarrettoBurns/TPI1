import React from 'react';

export const ErrorMessage = ({ message }) => (
    <div className="bg-red-900/50 border-l-4 border-red-500 text-red-200 p-4 rounded-lg my-4" role="alert">
        <p className="font-bold">Error</p>
        <p>{message}</p>
    </div>
);