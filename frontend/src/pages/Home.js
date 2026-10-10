import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
export default function Home() {
    const { data, isLoading, error } = useQuery({
        queryKey: ['health'],
        queryFn: () => apiFetch('/api/health'),
    });
    return (_jsx("div", { className: "min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center", children: _jsxs("div", { className: "bg-white rounded-lg shadow-lg p-8 max-w-md w-full", children: [_jsx("h1", { className: "text-3xl font-bold text-gray-900 mb-6", children: "MediaShelf" }), isLoading && (_jsx("p", { className: "text-gray-600", children: "Checking API health..." })), error && (_jsxs("div", { className: "bg-red-50 text-red-700 p-4 rounded", children: ["Error: ", error instanceof Error ? error.message : 'Unknown error'] })), data && (_jsxs("div", { className: "bg-green-50 text-green-700 p-4 rounded", children: [_jsx("p", { className: "font-semibold", children: data.service }), _jsxs("p", { children: ["Status: ", data.status] })] }))] }) }));
}
