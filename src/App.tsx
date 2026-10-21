import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { WelcomePage } from './pages/WelcomePage';
import { DashboardPage } from './pages/DashboardPage';
import { SegmentationPage } from './pages/SegmentationPage';
import { KnowledgeGraphPage } from './pages/KnowledgeGraphPage';
import { ChatPage } from './pages/ChatPage';
import { PlansPage } from './pages/PlansPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { CrawlerStatusPage } from './pages/CrawlerStatusPage';
import { ConsultationFeedbackPage } from './pages/ConsultationFeedbackPage';
import { PageType } from './types';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from './lib/utils';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentPage} />;
      case 'segmentation':
        return <SegmentationPage />;
      case 'graph':
        return <KnowledgeGraphPage />;
      case 'chat':
        return <ChatPage />;
      case 'consultation':
        return <ConsultationFeedbackPage />;
      case 'plans':
        return <PlansPage />;
      case 'crawler':
        return <CrawlerStatusPage />;
      case 'welcome':
        return <WelcomePage onStart={() => window.location.href = '/login'} />;
      default:
        return <DashboardPage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <Router>
      <Routes>
        {/* 公开路由 - 不显示导航栏 */}
        <Route
          path="/welcome"
          element={
            <div className="app-shell">
              <div className="ambient-orb ambient-orb-primary left-[-5rem] top-8 h-72 w-72" />
              <div className="ambient-orb ambient-orb-secondary right-[-4rem] top-20 h-80 w-80" />
              <div className="ambient-orb ambient-orb-accent bottom-[-3rem] left-1/3 h-64 w-64" />
              <div className="min-h-screen bg-transparent app-shell-content">
                <WelcomePage onStart={() => window.location.href = '/login'} />
              </div>
            </div>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        {/* 主应用路由 - 显示导航栏 */}
        <Route
          path="/*"
          element={
            <div className="app-shell">
              <div className="ambient-orb ambient-orb-primary left-[-6rem] top-10 h-80 w-80" />
              <div className="ambient-orb ambient-orb-secondary right-[-5rem] top-24 h-[22rem] w-[22rem]" />
              <div className="ambient-orb ambient-orb-accent bottom-[-4rem] right-1/4 h-72 w-72" />
              <div className="min-h-screen flex bg-transparent app-shell-content">
                {currentPage !== 'welcome' && (
                  <Navbar currentPage={currentPage} onPageChange={setCurrentPage} />
                )}
                
                <main
                  className={cn(
                    "relative flex-1 transition-all duration-300",
                    currentPage !== 'welcome' ? "pl-[21.5rem]" : ""
                  )}
                >
                  <div className="absolute left-[22rem] right-6 top-5 bottom-5 rounded-[40px] border border-white/20 bg-white/10 backdrop-blur-[2px]" />
                  <div className="relative h-full">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentPage}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      >
                        {renderPage()}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </main>
              </div>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}
