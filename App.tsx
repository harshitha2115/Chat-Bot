import React, { useState } from 'react';
import ChatBot from './components/ChatBot';
import LiveConversation from './components/LiveConversation';
import { BotIcon, MessageIcon, MicIcon } from './components/icons';

type View = 'chat' | 'live';

const App: React.FC = () => {
  const [view, setView] = useState<View>('chat');

  const renderView = () => {
    switch (view) {
      case 'chat':
        return <ChatBot />;
      case 'live':
        return <LiveConversation />;
      default:
        return <ChatBot />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      <header className="bg-gray-800 shadow-lg z-10">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <BotIcon className="w-8 h-8 text-cyan-400" />
            <h1 className="text-xl font-bold tracking-wider">Intelli Chat Bot</h1>
          </div>
          <nav className="flex items-center bg-gray-700 rounded-full p-1">
            <button
              onClick={() => setView('chat')}
              className={`px-4 py-2 text-sm font-medium rounded-full flex items-center space-x-2 transition-colors duration-200 ${
                view === 'chat' ? 'bg-cyan-500 text-white' : 'text-gray-300 hover:bg-gray-600'
              }`}
            >
              <MessageIcon className="w-5 h-5" />
              <span>Chat</span>
            </button>
            <button
              onClick={() => setView('live')}
              className={`px-4 py-2 text-sm font-medium rounded-full flex items-center space-x-2 transition-colors duration-200 ${
                view === 'live' ? 'bg-cyan-500 text-white' : 'text-gray-300 hover:bg-gray-600'
              }`}
            >
               <MicIcon className="w-5 h-5" />
              <span>Live</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col overflow-hidden">
        {renderView()}
      </main>
    </div>
  );
};

export default App;
