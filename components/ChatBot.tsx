import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Chat } from '@google/genai';
import { ChatMessage } from '../types';
import { BotIcon, SendIcon, UserIcon } from './icons';

// A simple markdown renderer
const Markdown = ({ content }: { content: string }) => {
    // Basic bold and code block support
    const formattedContent = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code class="bg-gray-700 text-sm rounded px-1 py-0.5">$1</code>');
    return <div dangerouslySetInnerHTML={{ __html: formattedContent }} />;
};


const ChatBot: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      content: "Hello! I'm the Intelli Chat Bot. How can I assist you today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initChat = () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        chatRef.current = ai.chats.create({
          model: 'gemini-2.5-flash',
          history: messages.map(msg => ({ role: msg.role, parts: [{ text: msg.content }]})),
        });
      } catch (error) {
        console.error("Failed to initialize Gemini:", error);
        setMessages(prev => [...prev, { role: 'model', content: 'Error: Could not initialize AI model. Please check your API key.'}]);
      }
    };
    initChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (input.trim() === '' || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
        if (!chatRef.current) {
            throw new Error("Chat not initialized");
        }
        
        const stream = await chatRef.current.sendMessageStream({ message: input });

        let modelResponse = '';
        setMessages(prev => [...prev, { role: 'model', content: '' }]);

        for await (const chunk of stream) {
            modelResponse += chunk.text;
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1].content = modelResponse;
                return newMessages;
            });
        }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { role: 'model', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg m-4 p-4 shadow-2xl">
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="flex flex-col space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex items-start space-x-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
               {msg.role === 'model' && <div className="p-2 bg-gray-700 rounded-full"><BotIcon className="w-6 h-6 text-cyan-400" /></div>}
               <div className={`max-w-xl p-3 rounded-xl shadow ${msg.role === 'user' ? 'bg-cyan-600' : 'bg-gray-700'}`}>
                <div className="prose prose-invert text-white prose-p:my-2 prose-strong:text-cyan-300">
                    <Markdown content={msg.content || '...'} />
                </div>
              </div>
              {msg.role === 'user' && <div className="p-2 bg-gray-700 rounded-full"><UserIcon className="w-6 h-6 text-gray-300" /></div>}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex items-center bg-gray-700 rounded-lg p-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-gray-400"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-2 rounded-full bg-cyan-500 text-white disabled:bg-gray-500 disabled:cursor-not-allowed hover:bg-cyan-600 transition-colors"
          >
            {isLoading ? (
               <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
            ) : (
                <SendIcon className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatBot;
