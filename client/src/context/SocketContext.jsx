import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5001';

export const SocketProvider = ({ children }) => {
    const { user } = useAuth();
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        if (!user?.token) {
            setSocket((prev) => {
                if (prev) {
                    prev.disconnect();
                }
                return null;
            });
            setConnected(false);
            return;
        }

        const s = io(SOCKET_URL, {
            auth: { token: user.token },
            transports: ['websocket', 'polling'],
        });

        s.on('connect', () => setConnected(true));
        s.on('disconnect', () => setConnected(false));

        setSocket(s);

        return () => {
            s.disconnect();
            setSocket(null);
            setConnected(false);
        };
    }, [user?.token]);

    return (
        <SocketContext.Provider value={{ socket, connected }}>
            {children}
        </SocketContext.Provider>
    );
};
