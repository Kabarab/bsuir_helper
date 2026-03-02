import { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { GraduationCap, ArrowRight } from 'lucide-react';

export default function Onboarding() {
  const { updatePreferences } = useUser();
  const [inputGroup, setInputGroup] = useState('');
  const [inputStudentId, setInputStudentId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!inputGroup.trim()) return;
    setIsLoading(true);
    await updatePreferences(inputGroup.trim(), 0, inputStudentId.trim());
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-tg-button rounded-full blur-[100px] opacity-20"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-emerald-500 rounded-full blur-[100px] opacity-10"></div>
      
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
        <div className="w-20 h-20 bg-tg-button/10 rounded-3xl flex items-center justify-center mb-6 shadow-inner border border-tg-button/20">
          <GraduationCap size={40} className="text-tg-button" />
        </div>
        
        <h1 className="text-3xl font-black mb-2 text-center text-tg-text">Добро пожаловать</h1>
        <p className="text-tg-hint text-center mb-8 font-medium">
          Давайте настроим приложение под вас. Для начала, введите номер вашей группы или студенческого.
        </p>

        <div className="w-full space-y-4">
          <div className="relative">
            <input 
              type="text" 
              value={inputGroup}
              onChange={(e) => setInputGroup(e.target.value)}
              placeholder="Учебная группа (напр. 114041)" 
              className="w-full p-4 pl-5 pr-12 rounded-2xl bg-tg-secondaryBg border-2 border-transparent focus:border-tg-button outline-none text-lg font-bold shadow-sm transition-all text-tg-text placeholder:font-medium placeholder:text-tg-hint/50"
            />
          </div>

          <div className="relative">
            <input 
              type="text" 
              value={inputStudentId}
              onChange={(e) => setInputStudentId(e.target.value)}
              placeholder="Номер студенческого (для оценок)" 
              className="w-full p-4 pl-5 pr-12 rounded-2xl bg-tg-secondaryBg border-2 border-transparent focus:border-tg-button outline-none text-lg font-bold shadow-sm transition-all text-tg-text placeholder:font-medium placeholder:text-tg-hint/50"
            />
          </div>

          <button 
            onClick={handleSave}
            disabled={!inputGroup.trim() || isLoading}
            className="w-full bg-tg-button text-tg-buttonText p-4 rounded-2xl font-bold text-lg flex justify-center items-center gap-2 shadow-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>Начать <ArrowRight size={20} /></>
            )}
          </button>
        </div>

        <p className="text-xs text-tg-hint/60 mt-6 text-center">
          Номер студенческого необходим для получения рейтинга и оценок. Группа — для расписания.
        </p>
      </div>
    </div>
  );
}
