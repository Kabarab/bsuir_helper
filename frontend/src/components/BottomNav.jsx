import { NavLink } from 'react-router-dom';
import { CheckSquare, BookA, CalendarDays, Building } from 'lucide-react';

export default function BottomNav() {
  const linkClass = ({ isActive }) => 
    `flex flex-col items-center gap-1 p-2 w-full transition-colors ${
      isActive ? 'text-tg-button' : 'text-tg-hint hover:text-tg-text'
    }`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-tg-secondaryBg border-t border-[var(--tg-theme-hint-color)] border-opacity-20 pb-safe z-50">
      <div className="flex justify-around items-center h-16">
        <NavLink to="/" className={linkClass}>
          <CheckSquare size={24} />
          <span className="text-xs font-medium">Планер</span>
        </NavLink>
        <NavLink to="/study" className={linkClass}>
          <BookA size={24} />
          <span className="text-xs font-medium">Учеба</span>
        </NavLink>
        <NavLink to="/schedule" className={linkClass}>
          <CalendarDays size={24} />
          <span className="text-xs font-medium">Расписание</span>
        </NavLink>
        <NavLink to="/university" className={linkClass}>
          <Building size={24} />
          <span className="text-xs font-medium">Универ</span>
        </NavLink>
      </div>
    </nav>
  );
}
