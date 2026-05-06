// src/core/i18n.js — multi-language support
// Usage: import { t, setLang, getLang } from '../../core/i18n.js'

const STORAGE_KEY = 'workhub_lang'

const TRANSLATIONS = {
  uk: {
    // Navigation
    'nav.main': 'Головне',
    'nav.account': 'Акаунт',
    'nav.cabinet': 'Мій кабінет',
    'nav.settings': 'Налаштування',
    'nav.upgrade': 'Перейти на PRO',
    'nav.join': 'Долучитись до команди',
    'nav.logout': '↪ Вийти',
    'nav.team': 'Команда',
    'nav.admin': 'Адмін панель',

    // Settings page — general
    'settings.title': 'Налаштування',
    'settings.subtitle': 'Керуйте профілем, мовою та безпекою',

    // Settings tabs
    'settings.tab.profile': 'Профіль',
    'settings.tab.language': 'Мова',
    'settings.tab.appearance': 'Вигляд',
    'settings.tab.security': 'Безпека',
    'settings.tab.subscription': 'Підписка',
    'settings.tab.danger': 'Небезпека',

    // Profile tab
    'profile.title': 'Особиста інформація',
    'profile.avatar_hint': 'Натисніть щоб змінити',
    'profile.name': "Повне ім'я",
    'profile.name_placeholder': 'Іван Петренко',
    'profile.email': 'Email',
    'profile.email_hint': '📧 Email не можна змінити',
    'profile.phone': 'Телефон',
    'profile.phone_placeholder': '+380 XX XXX XX XX',
    'profile.city': 'Місто',
    'profile.city_placeholder': 'Київ',
    'profile.save': 'Зберегти зміни',
    'profile.saved': 'Профіль оновлено ✓',
    'profile.error': 'Помилка збереження',
    'profile.name_required': "Введіть ім'я",

    // Language tab
    'lang.title': 'Мова інтерфейсу',
    'lang.subtitle': 'Оберіть мову, якою відображатиметься WorkHub',
    'lang.uk': 'Українська',
    'lang.en': 'English',
    'lang.pl': 'Polski',
    'lang.uk_desc': 'Основна мова додатку',
    'lang.en_desc': 'Primary app language',
    'lang.pl_desc': 'Główny język aplikacji',
    'lang.saved': 'Мову змінено ✓',
    'lang.apply': 'Застосувати',
    'lang.region': 'Регіон та формат',
    'lang.date_format': 'Формат дати',
    'lang.currency': 'Валюта за замовчуванням',

    // Security tab
    'security.title': 'Безпека акаунта',
    'security.warning': 'Для зміни пароля потрібно підтвердити поточний пароль',
    'security.current_pass': 'Поточний пароль',
    'security.new_pass': 'Новий пароль',
    'security.new_pass_hint': 'Мінімум 6 символів',
    'security.confirm_pass': 'Підтвердіть новий пароль',
    'security.change_btn': 'Змінити пароль',
    'security.fill_all': 'Заповніть всі поля',
    'security.min_length': 'Пароль має бути мінімум 6 символів',
    'security.mismatch': 'Паролі не співпадають',
    'security.changed': 'Пароль змінено ✓',
    'security.wrong_pass': 'Неправильний поточний пароль',
    'security.error': 'Помилка зміни пароля',
    'security.sessions': 'Сесії та пристрої',
    'security.sessions_desc': 'Поточна сесія активна',
    'security.logout_all': 'Вийти всюди',

    // Subscription tab
    'sub.title': 'Підписка',
    'sub.current_plan': 'Поточний план',
    'sub.active': '✓ Активна',
    'sub.inactive': '○ Неактивна',
    'sub.expires': 'Діє до:',
    'sub.manage': 'Керувати підпискою',
    'sub.upgrade': 'Перейти на PRO ⭐',
    'sub.free_desc': 'Основні функції безкоштовно',
    'sub.pro_desc': 'Всі модулі + пріоритетна підтримка',
    'sub.biz_desc': 'Мультибізнес + команда + API',

    // Danger zone
    'danger.title': 'Небезпечна зона',
    'danger.logout_title': 'Вийти з акаунта',
    'danger.logout_desc': 'Вийти з поточного облікового запису',
    'danger.logout_btn': 'Вийти',
    'danger.logout_confirm': 'Ви впевнені що хочете вийти?',
    'danger.delete_title': 'Видалити акаунт',
    'danger.delete_desc': 'Назавжди видалити акаунт та всі дані',
    'danger.delete_btn': 'Видалити акаунт',
    'danger.delete_prompt': 'Це незворотня дія! Введіть "ВИДАЛИТИ" для підтвердження:',
    'danger.delete_wip': 'Функція в розробці. Зверніться в підтримку.',

    // Common
    'common.save': 'Зберегти',
    'common.cancel': 'Скасувати',
    'common.close': 'Закрити',
    'common.loading': 'Завантаження...',
    'common.saving': 'Збереження...',
    'common.error': 'Помилка',
    'common.success': 'Успішно',
  },

  en: {
    // Navigation
    'nav.main': 'Main',
    'nav.account': 'Account',
    'nav.cabinet': 'My Business',
    'nav.settings': 'Settings',
    'nav.upgrade': 'Upgrade to PRO',
    'nav.join': 'Join a team',
    'nav.logout': '↪ Logout',
    'nav.team': 'Team',
    'nav.admin': 'Admin panel',

    // Settings page
    'settings.title': 'Settings',
    'settings.subtitle': 'Manage your profile, language and security',

    // Settings tabs
    'settings.tab.profile': 'Profile',
    'settings.tab.language': 'Language',
    'settings.tab.appearance': 'Appearance',
    'settings.tab.security': 'Security',
    'settings.tab.subscription': 'Subscription',
    'settings.tab.danger': 'Danger',

    // Profile tab
    'profile.title': 'Personal information',
    'profile.avatar_hint': 'Click to change',
    'profile.name': 'Full name',
    'profile.name_placeholder': 'John Smith',
    'profile.email': 'Email',
    'profile.email_hint': '📧 Email cannot be changed',
    'profile.phone': 'Phone',
    'profile.phone_placeholder': '+1 XXX XXX XXXX',
    'profile.city': 'City',
    'profile.city_placeholder': 'New York',
    'profile.save': 'Save changes',
    'profile.saved': 'Profile updated ✓',
    'profile.error': 'Save error',
    'profile.name_required': 'Enter your name',

    // Language tab
    'lang.title': 'Interface language',
    'lang.subtitle': 'Choose the language for WorkHub interface',
    'lang.uk': 'Українська',
    'lang.en': 'English',
    'lang.pl': 'Polski',
    'lang.uk_desc': 'Primary app language',
    'lang.en_desc': 'Primary app language',
    'lang.pl_desc': 'Główny język aplikacji',
    'lang.saved': 'Language changed ✓',
    'lang.apply': 'Apply',
    'lang.region': 'Region & format',
    'lang.date_format': 'Date format',
    'lang.currency': 'Default currency',

    // Security tab
    'security.title': 'Account security',
    'security.warning': 'To change your password, you need to confirm your current password',
    'security.current_pass': 'Current password',
    'security.new_pass': 'New password',
    'security.new_pass_hint': 'Minimum 6 characters',
    'security.confirm_pass': 'Confirm new password',
    'security.change_btn': 'Change password',
    'security.fill_all': 'Fill in all fields',
    'security.min_length': 'Password must be at least 6 characters',
    'security.mismatch': 'Passwords do not match',
    'security.changed': 'Password changed ✓',
    'security.wrong_pass': 'Wrong current password',
    'security.error': 'Password change error',
    'security.sessions': 'Sessions & devices',
    'security.sessions_desc': 'Current session is active',
    'security.logout_all': 'Logout everywhere',

    // Subscription tab
    'sub.title': 'Subscription',
    'sub.current_plan': 'Current plan',
    'sub.active': '✓ Active',
    'sub.inactive': '○ Inactive',
    'sub.expires': 'Expires:',
    'sub.manage': 'Manage subscription',
    'sub.upgrade': 'Upgrade to PRO ⭐',
    'sub.free_desc': 'Core features for free',
    'sub.pro_desc': 'All modules + priority support',
    'sub.biz_desc': 'Multi-business + team + API',

    // Danger zone
    'danger.title': 'Danger zone',
    'danger.logout_title': 'Sign out',
    'danger.logout_desc': 'Sign out from the current account on this device',
    'danger.logout_btn': 'Sign out',
    'danger.logout_confirm': 'Are you sure you want to sign out?',
    'danger.delete_title': 'Delete account',
    'danger.delete_desc': 'Permanently delete your account and all data',
    'danger.delete_btn': 'Delete account',
    'danger.delete_prompt': 'This is irreversible! Type "DELETE" to confirm:',
    'danger.delete_wip': 'Feature in development. Contact support.',

    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.loading': 'Loading...',
    'common.saving': 'Saving...',
    'common.error': 'Error',
    'common.success': 'Success',
  },

  pl: {
    // Navigation
    'nav.main': 'Główne',
    'nav.account': 'Konto',
    'nav.cabinet': 'Mój biznes',
    'nav.settings': 'Ustawienia',
    'nav.upgrade': 'Przejdź na PRO',
    'nav.join': 'Dołącz do zespołu',
    'nav.logout': '↪ Wyloguj',
    'nav.team': 'Zespół',
    'nav.admin': 'Panel admina',

    // Settings page
    'settings.title': 'Ustawienia',
    'settings.subtitle': 'Zarządzaj profilem, językiem i bezpieczeństwem',

    // Settings tabs
    'settings.tab.profile': 'Profil',
    'settings.tab.language': 'Język',
    'settings.tab.appearance': 'Wygląd',
    'settings.tab.security': 'Bezpieczeństwo',
    'settings.tab.subscription': 'Subskrypcja',
    'settings.tab.danger': 'Niebezpieczne',

    // Profile tab
    'profile.title': 'Informacje osobiste',
    'profile.avatar_hint': 'Kliknij aby zmienić',
    'profile.name': 'Imię i nazwisko',
    'profile.name_placeholder': 'Jan Kowalski',
    'profile.email': 'Email',
    'profile.email_hint': '📧 Emailu nie można zmienić',
    'profile.phone': 'Telefon',
    'profile.phone_placeholder': '+48 XXX XXX XXX',
    'profile.city': 'Miasto',
    'profile.city_placeholder': 'Warszawa',
    'profile.save': 'Zapisz zmiany',
    'profile.saved': 'Profil zaktualizowany ✓',
    'profile.error': 'Błąd zapisu',
    'profile.name_required': 'Podaj imię',

    // Language tab
    'lang.title': 'Język interfejsu',
    'lang.subtitle': 'Wybierz język dla interfejsu WorkHub',
    'lang.uk': 'Українська',
    'lang.en': 'English',
    'lang.pl': 'Polski',
    'lang.uk_desc': 'Główny język aplikacji',
    'lang.en_desc': 'Primary app language',
    'lang.pl_desc': 'Główny język aplikacji',
    'lang.saved': 'Język zmieniony ✓',
    'lang.apply': 'Zastosuj',
    'lang.region': 'Region i format',
    'lang.date_format': 'Format daty',
    'lang.currency': 'Domyślna waluta',

    // Security tab
    'security.title': 'Bezpieczeństwo konta',
    'security.warning': 'Aby zmienić hasło, musisz potwierdzić aktualne hasło',
    'security.current_pass': 'Aktualne hasło',
    'security.new_pass': 'Nowe hasło',
    'security.new_pass_hint': 'Minimum 6 znaków',
    'security.confirm_pass': 'Potwierdź nowe hasło',
    'security.change_btn': 'Zmień hasło',
    'security.fill_all': 'Wypełnij wszystkie pola',
    'security.min_length': 'Hasło musi mieć co najmniej 6 znaków',
    'security.mismatch': 'Hasła nie pasują',
    'security.changed': 'Hasło zmienione ✓',
    'security.wrong_pass': 'Nieprawidłowe aktualne hasło',
    'security.error': 'Błąd zmiany hasła',
    'security.sessions': 'Sesje i urządzenia',
    'security.sessions_desc': 'Bieżąca sesja jest aktywna',
    'security.logout_all': 'Wyloguj wszędzie',

    // Subscription tab
    'sub.title': 'Subskrypcja',
    'sub.current_plan': 'Aktualny plan',
    'sub.active': '✓ Aktywna',
    'sub.inactive': '○ Nieaktywna',
    'sub.expires': 'Ważna do:',
    'sub.manage': 'Zarządzaj subskrypcją',
    'sub.upgrade': 'Przejdź na PRO ⭐',
    'sub.free_desc': 'Podstawowe funkcje za darmo',
    'sub.pro_desc': 'Wszystkie moduły + wsparcie',
    'sub.biz_desc': 'Multi-biznes + zespół + API',

    // Danger zone
    'danger.title': 'Strefa niebezpieczna',
    'danger.logout_title': 'Wyloguj się',
    'danger.logout_desc': 'Wyloguj się z bieżącego konta na tym urządzeniu',
    'danger.logout_btn': 'Wyloguj',
    'danger.logout_confirm': 'Czy na pewno chcesz się wylogować?',
    'danger.delete_title': 'Usuń konto',
    'danger.delete_desc': 'Trwale usuń swoje konto i wszystkie dane',
    'danger.delete_btn': 'Usuń konto',
    'danger.delete_prompt': 'To jest nieodwracalne! Wpisz "USUŃ" aby potwierdzić:',
    'danger.delete_wip': 'Funkcja w trakcie tworzenia. Skontaktuj się z pomocą techniczną.',

    // Common
    'common.save': 'Zapisz',
    'common.cancel': 'Anuluj',
    'common.close': 'Zamknij',
    'common.loading': 'Ładowanie...',
    'common.saving': 'Zapisywanie...',
    'common.error': 'Błąd',
    'common.success': 'Sukces',
  },
}

let _currentLang = localStorage.getItem(STORAGE_KEY) || 'uk'

export function getLang() {
  return _currentLang
}

export function setLang(lang) {
  if (!TRANSLATIONS[lang]) return
  _currentLang = lang
  localStorage.setItem(STORAGE_KEY, lang)
  document.documentElement.lang = lang
  // dispatch event so components can react
  window.dispatchEvent(new CustomEvent('lang-change', { detail: { lang } }))
}

export function t(key) {
  return TRANSLATIONS[_currentLang]?.[key] ?? TRANSLATIONS['uk']?.[key] ?? key
}

export const SUPPORTED_LANGS = [
  { code: 'uk', label: 'Українська', flag: '🇺🇦', native: 'UA' },
  { code: 'en', label: 'English',    flag: '🇬🇧', native: 'EN' },
  { code: 'pl', label: 'Polski',     flag: '🇵🇱', native: 'PL' },
]

// Init on load
document.documentElement.lang = _currentLang
