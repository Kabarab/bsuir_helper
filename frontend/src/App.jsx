import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Planner from './pages/Planner';
import Study from './pages/Study';

import Schedule from './pages/Schedule';
import University from './pages/University';
import Onboarding from './pages/Onboarding';
import Settings from './pages/Settings';
import BottomNav from './components/BottomNav';
import { UserProvider, useUser } from './contexts/UserContext';

const AuthWrapper = ({ children }) => {
  const { group, isTeacher, teacherUrlId, isInitializing } = useUser();

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-tg-bg flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-tg-button/30 border-t-tg-button rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!group && !(isTeacher && teacherUrlId)) {
    return <Onboarding />;
  }

  return children;
};

function App() {
  return (
    <UserProvider>
      <Router>
        <div className="h-screen overflow-y-auto bg-tg-bg text-tg-text overscroll-none">
          <AuthWrapper>
            <div className="pb-24">
              <Routes>
                <Route path="/" element={<Navigate to="/schedule" replace />} />
                <Route path="/planner" element={<Planner />} />
                <Route path="/study" element={<Study />} />
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/university" element={<University />} />

                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/schedule" replace />} />
              </Routes>
            </div>
            <BottomNav />
          </AuthWrapper>
        </div>
      </Router>
    </UserProvider>
  );
}

export default App;
