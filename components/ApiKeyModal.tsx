import React, { useState, useEffect } from 'react';
import { getUserApiKey, setUserApiKey } from '../services/apiKeyService';
import { CloseIcon, DeviceFloppyIcon } from './icons';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose }) => {
  const [apiKeyInput, setApiKeyInput] = useState('');

  // When the modal opens, fetch the current key
  useEffect(() => {
    if (isOpen) {
      setApiKeyInput(getUserApiKey());
    }
  }, [isOpen]);

  const handleSave = () => {
    setUserApiKey(apiKeyInput);
    alert('API 키가 저장 및 적용되었습니다.');
    onClose();
  };
  
  // Handle Escape key to close the modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);


  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="apiKeyModalTitle"
    >
      <div
        className="bg-[var(--bg-secondary)] rounded-xl shadow-2xl w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors"
          aria-label="Close modal"
        >
          <CloseIcon className="w-6 h-6 text-[var(--text-secondary)]" />
        </button>

        <h2 id="apiKeyModalTitle" className="text-2xl font-bold text-[var(--text-primary)] mb-4">
          Gemini API 키 설정
        </h2>
        <p className="text-[var(--text-secondary)] mb-6 text-sm">
          자신의 Gemini API 키를 입력하여 개인 할당량을 사용할 수 있습니다. 입력하지 않으면 내장된 기본 키가 사용됩니다.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="api-key-modal-input" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Gemini API 키
            </label>
            <input
              id="api-key-modal-input"
              type="password"
              placeholder="API 키를 여기에 붙여넣으세요"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-3 text-[var(--text-primary)] focus:ring-[var(--ring-accent)] focus:border-[var(--border-accent)]"
              autoFocus
            />
          </div>

          <div className="flex justify-end items-center gap-4 pt-4">
             <button
              onClick={onClose}
              className="bg-[var(--bg-interactive)] text-[var(--text-primary)] font-bold py-2 px-6 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="bg-[var(--bg-accent)] text-[var(--text-on-accent)] font-bold py-2 px-6 rounded-lg hover:bg-[var(--bg-accent-hover)] transition-colors flex items-center gap-2"
            >
              <DeviceFloppyIcon className="w-5 h-5" />
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
