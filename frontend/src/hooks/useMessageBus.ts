import { useState, useEffect, useRef, useCallback } from "react";
import { MessageBus } from "../services/messageBus";
import { WebSocketBus, createWebSocketBus } from "../services/websocketBus";
import type { Message } from "../types/messages";
import { MessageType } from "../types/messages";

interface UseMessageBusConfig {
  wsUrl: string;
  token: string;
  handlers?: {
    [K in MessageType]?: (message: Message) => void;
  };
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

interface UseMessageBusReturn {
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  send: (type: MessageType, payload: Record<string, any>) => void;
}

export const useMessageBus = ({
  wsUrl,
  token,
  handlers = {},
  onConnect,
  onDisconnect,
  onError,
}: UseMessageBusConfig): UseMessageBusReturn => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messageBusRef = useRef<MessageBus | null>(null);
  const webSocketRef = useRef<WebSocketBus | null>(null);
  const handlersRef = useRef(handlers);

  // Update handlers ref when handlers change
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // Initialize message bus
  useEffect(() => {
    messageBusRef.current = new MessageBus({
      onMessage: (message) => {
        console.log('MessageBus received:', message);
        
        // Call the specific handler for this message type if it exists
        const handler = handlersRef.current[message.type];
        if (handler) {
          try {
            handler(message);
          } catch (error) {
            console.error(`Error in handler for ${message.type}:`, error);
            onError?.(`Handler error for ${message.type}: ${error}`);
          }
        } else {
          // Default handling for unhandled message types
          console.log(`No handler registered for message type: ${message.type}`);
        }
      },
      onError: (errorMsg) => {
        console.error('MessageBus error:', errorMsg);
        setError(errorMsg);
        onError?.(errorMsg);
      },
      onConnect: () => {
        console.log('MessageBus connected');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        onConnect?.();
      },
      onDisconnect: () => {
        console.log('MessageBus disconnected');
        setIsConnected(false);
        setIsConnecting(false);
        onDisconnect?.();
      }
    });

    return () => {
      messageBusRef.current?.clear();
    };
  }, [onConnect, onDisconnect, onError]);


  const connect = useCallback(async () => {
    if (!messageBusRef.current) {
      throw new Error('MessageBus not initialized');
    }

    setIsConnecting(true);
    setError(null);

    try {
      webSocketRef.current = createWebSocketBus(wsUrl, token, messageBusRef.current);
      await webSocketRef.current.connect();
    } catch (err) {
      console.error("Failed to connect:", err);
      setIsConnecting(false);
      setIsConnected(false);
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  }, [wsUrl, token]);

  const disconnect = useCallback(() => {
    if (webSocketRef.current) {
      webSocketRef.current.disconnect();
      webSocketRef.current = null;
    }
  }, []);

  const send = useCallback((type: MessageType, payload: Record<string, any> = {}) => {
    if (isConnected && webSocketRef.current) {
      try {
        console.log("Sending message:", { type, payload });
        webSocketRef.current.sendMessage({
          type,
          data: payload,
          timestamp: Date.now()
        });
      } catch (err) {
        console.error("Failed to send message:", err);
        setError("Failed to send message. Please check your connection.");
      }
    } else {
      setError("Not connected to Workspace.");
    }
  }, [isConnected]);


  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (webSocketRef.current) {
        webSocketRef.current.disconnect();
      }
    };
  }, []);

  return {
    isConnecting,
    isConnected,
    error,
    connect,
    disconnect,
    send,
  };
}; 