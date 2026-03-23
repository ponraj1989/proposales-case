'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { type UIMessage, DefaultChatTransport } from 'ai';
import { cn } from '@proposales/ui';
import { ChartCard, type ChartConfig } from '@/components/chat/ChartCard';
import { useUser } from '@/lib/hooks';
import { getContentPrice as getContentPriceForForm } from '@/lib/content-prices';
import { QRCodeSVG } from 'qrcode.react';

// ─── Types ───

interface ToolPart {
  type: string;
  toolName: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

interface ProposalDraft {
  type: 'proposal_draft';
  title: string;
  description: string;
  items: {
    name: string;
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    content_id?: number;
    image_url?: string;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  recipient: { name: string; email: string; company: string };
  company_id: number;
  language: string;
  notes: string;
  venue_type?: string | null;
  header_image?: string | null;
  negotiation_round: number;
  max_negotiation_rounds: number;
  discount_applied: number;
  is_final_offer?: boolean;
  proposalUuid?: string | null;
  proposalUrl?: string | null;
}

function getDraftAcceptanceKey(draft: Pick<ProposalDraft, 'title' | 'recipient'>): string {
  return `${draft.title}::${draft.recipient.email.trim().toLowerCase()}`;
}

interface StoredConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
}

// ─── Rich Tool Result Types ───

interface ImageResult {
  type: 'image_result';
  success: boolean;
  image?: {
    base64: string;
    mimeType: string;
    label: string;
  };
  error?: string;
}

interface AvailabilityOption {
  space_name: string;
  time_slot: string;
  date: string;
  capacity: number;
  base_price: number;
  total_price: number;
  currency: string;
  utilization: number;
  features?: string[];
  image_url?: string;
}

interface AvailabilityResult {
  type: 'availability';
  query: { date: string; guests: number; event_type: string; time_slot: string };
  options: AvailabilityOption[];
}

interface PricingResult {
  type: string;
  space_name: string;
  base_price: number;
  total_price: number;
  currency: string;
  breakdown: { factor: string; multiplier: number }[];
}

interface SearchItem {
  uuid?: string;
  title?: string;
  title_md?: string;
  status?: string;
  value_with_tax?: number;
  currency?: string;
  contact_name?: string;
  recipient_name?: string;
}

interface SearchResultSet {
  type: 'proposals';
  items: SearchItem[];
  total: number;
}

// ─── New Rich Result Types ───

interface CalendarDay {
  date: string;
  day: number;
  dow: number;
  status: 'available' | 'limited' | 'booked';
  slots_available: number;
  slots_total: number;
}

interface CalendarResult {
  type: 'availability_calendar';
  year: number;
  month: number;
  month_name: string;
  space_name: string;
  days: CalendarDay[];
  summary: { available: number; limited: number; booked: number };
}

interface FloorPlanResult {
  type: 'floor_plan';
  space_name: string;
  space_type: string;
  layout: string;
  guests: number;
  max_capacity_for_layout: number;
  fits: boolean;
  recommendation: string;
  layouts_available: { layout: string; max_capacity: number; fits_guests: boolean }[];
}

interface UserInputOption {
  value: string;
  label: string;
  icon?: string;
}

interface UserInputField {
  name: string;
  label: string;
  type: 'select' | 'date' | 'number' | 'text' | 'toggle_group';
  required?: boolean;
  placeholder?: string;
  options?: UserInputOption[];
  min?: number;
  max?: number;
  default_value?: string;
}

interface UserInputRequest {
  type: 'user_input_request';
  title: string;
  description?: string;
  fields: UserInputField[];
}

// ─── Language options ───

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
];

// ─── UI Translations (chat page only) ───

type LangCode = 'en' | 'sv' | 'de' | 'fr' | 'es' | 'zh' | 'ar' | 'ja';

const UI_STRINGS: Record<string, Record<LangCode, string>> = {
  conversations: { en: 'Conversations', sv: 'Konversationer', de: 'Gespräche', fr: 'Conversations', es: 'Conversaciones', zh: '对话', ar: 'المحادثات', ja: '会話' },
  newChat: { en: 'New chat', sv: 'Ny chatt', de: 'Neuer Chat', fr: 'Nouveau chat', es: 'Nuevo chat', zh: '新对话', ar: 'محادثة جديدة', ja: '新しいチャット' },
  noConversations: { en: 'No conversations yet', sv: 'Inga konversationer ännu', de: 'Noch keine Gespräche', fr: 'Aucune conversation', es: 'Sin conversaciones aún', zh: '暂无对话', ar: 'لا توجد محادثات بعد', ja: 'まだ会話がありません' },
  startTyping: { en: 'Start typing to begin', sv: 'Börja skriva för att starta', de: 'Tippe, um zu beginnen', fr: 'Commencez à écrire', es: 'Escribe para comenzar', zh: '输入开始', ar: 'ابدأ بالكتابة', ja: '入力して開始' },
  deleteConversation: { en: 'Delete conversation', sv: 'Ta bort konversation', de: 'Gespräch löschen', fr: 'Supprimer la conversation', es: 'Eliminar conversación', zh: '删除对话', ar: 'حذف المحادثة', ja: '会話を削除' },
  salesTitle: { en: 'AI Sales Assistant', sv: 'AI Säljassistent', de: 'KI-Verkaufsassistent', fr: 'Assistant IA de vente', es: 'Asistente IA de ventas', zh: 'AI 销售助手', ar: 'مساعد مبيعات الذكاء الاصطناعي', ja: 'AI営業アシスタント' },
  guestTitle: { en: '🏨 Your Hotel Buddy', sv: '🏨 Din Hotellkompis', de: '🏨 Dein Hotel-Buddy', fr: '🏨 Votre Compagnon Hôtelier', es: '🏨 Tu Amigo del Hotel', zh: '🏨 你的酒店伙伴', ar: '🏨 رفيقك الفندقي', ja: '🏨 ホテルバディ' },
  salesSubtitle: { en: 'Create proposals, analyze pipeline, manage proposals', sv: 'Skapa offerter, analysera pipeline, hantera offerter', de: 'Angebote erstellen, Pipeline analysieren, Angebote verwalten', fr: 'Créer des offres, analyser le pipeline, gérer les propositions', es: 'Crear propuestas, analizar el pipeline, gestionar propuestas', zh: '创建提案、分析业务管道、管理提案', ar: 'إنشاء عروض، تحليل خط الأنابيب، إدارة العروض', ja: '提案作成、パイプライン分析、提案管理' },
  guestSubtitle: { en: 'Events, rooms, prices & good vibes — ask me anything!', sv: 'Event, rum, priser & bra vibbar — fråga mig vad som helst!', de: 'Events, Räume, Preise & gute Laune — frag mich alles!', fr: 'Événements, chambres, prix & bonne ambiance — demandez-moi !', es: '¡Eventos, habitaciones, precios y buena onda — pregúntame!', zh: '活动、客房、价格和好心情——随便问我！', ar: 'فعاليات، غرف، أسعار وأجواء رائعة — اسألني أي شيء!', ja: 'イベント、客室、料金＆楽しい雰囲気——何でも聞いて！' },
  salesDraftNote: { en: 'Sales AI can generate proposal drafts and create proposals after your confirmation.', sv: 'Sälj-AI kan generera offertförslag och skapa offerter efter din bekräftelse.', de: 'Die Verkaufs-KI kann Angebotsentwürfe generieren und nach Ihrer Bestätigung erstellen.', fr: "L'IA de vente peut générer des brouillons et créer des propositions après votre confirmation.", es: 'La IA de ventas puede generar borradores y crear propuestas tras su confirmación.', zh: '销售AI可以生成提案草稿，并在您确认后创建提案。', ar: 'يمكن لذكاء المبيعات إنشاء مسودات عروض وإنشاء عروض بعد تأكيدك.', ja: '営業AIが提案の下書きを作成し、確認後に提案を作成できます。' },
  chatMode: { en: 'Chat', sv: 'Chatt', de: 'Chat', fr: 'Chat', es: 'Chat', zh: '聊天', ar: 'محادثة', ja: 'チャット' },
  formMode: { en: 'Form', sv: 'Formulär', de: 'Formular', fr: 'Formulaire', es: 'Formulario', zh: '表单', ar: 'نموذج', ja: 'フォーム' },
  salesPlaceholder: { en: 'Ask about analytics, charts, pipeline insights, or improvements...', sv: 'Fråga om analys, diagram, pipeline-insikter eller förbättringar...', de: 'Fragen Sie nach Analysen, Diagrammen, Pipeline-Einblicken oder Verbesserungen...', fr: "Posez vos questions sur l'analytique, les graphiques, le pipeline ou les améliorations...", es: 'Pregunta sobre análisis, gráficos, pipeline o mejoras...', zh: '询问分析、图表、业务洞察或改进建议...', ar: 'اسأل عن التحليلات، الرسوم البيانية، رؤى خط الأنابيب أو التحسينات...', ja: '分析、チャート、パイプラインの洞察、改善点について質問...' },
  guestPlaceholder: { en: 'Ask me about rooms, parties, food, or anything hotel-related! 🌟', sv: 'Fråga mig om rum, fester, mat eller allt hotellrelaterat! 🌟', de: 'Frag mich nach Zimmern, Feiern, Essen oder allem rund ums Hotel! 🌟', fr: 'Demandez-moi pour les chambres, fêtes, repas ou tout ce qui concerne l\'hôtel ! 🌟', es: '¡Pregúntame sobre habitaciones, fiestas, comida o cualquier cosa del hotel! 🌟', zh: '问我关于客房、派对、餐饮或任何酒店相关的事情！🌟', ar: 'اسألني عن الغرف، الحفلات، الطعام أو أي شيء يتعلق بالفندق! 🌟', ja: '客室、パーティー、料理、ホテルのことなら何でも聞いて！🌟' },
  aiDisclaimer: { en: 'AI can make mistakes. Always double-check proposals before sending — even robots need a proofreader! 🤖', sv: 'AI kan göra misstag. Dubbelkolla alltid offerter innan du skickar — även robotar behöver korrekturläsare! 🤖', de: 'KI kann Fehler machen. Überprüfen Sie Angebote immer vor dem Senden — auch Roboter brauchen Korrekturleser! 🤖', fr: "L'IA peut faire des erreurs. Vérifiez toujours les propositions avant envoi — même les robots ont besoin d'un correcteur ! 🤖", es: 'La IA puede cometer errores. Siempre revisa las propuestas antes de enviar — ¡hasta los robots necesitan corrector! 🤖', zh: 'AI可能会犯错。发送前请务必仔细检查提案——机器人也需要校对员！🤖', ar: 'قد يخطئ الذكاء الاصطناعي. تحقق دائمًا من العروض قبل الإرسال — حتى الروبوتات تحتاج مدققًا! 🤖', ja: 'AIは間違えることがあります。送信前に提案を必ず確認してください——ロボットも校正者が必要です！🤖' },
  timedOut: { en: 'Response timed out. Please send again to continue.', sv: 'Svaret tog för lång tid. Skicka igen för att fortsätta.', de: 'Zeitüberschreitung. Bitte erneut senden, um fortzufahren.', fr: 'Réponse expirée. Renvoyez pour continuer.', es: 'Tiempo agotado. Envía de nuevo para continuar.', zh: '响应超时。请重新发送以继续。', ar: 'انتهت مهلة الاستجابة. أعد الإرسال للمتابعة.', ja: '応答がタイムアウトしました。続行するには再送信してください。' },
  salesEmptyTitle: { en: 'Sales Analytics & Insights', sv: 'Säljanalys & Insikter', de: 'Verkaufsanalysen & Insights', fr: 'Analyses & Insights de Vente', es: 'Análisis de Ventas & Insights', zh: '销售分析与洞察', ar: 'تحليلات المبيعات والرؤى', ja: '営業分析＆インサイト' },
  guestEmptyTitle: { en: 'Hey there! 👋 Welcome!', sv: 'Hej! 👋 Välkommen!', de: 'Hallo! 👋 Willkommen!', fr: 'Bonjour ! 👋 Bienvenue !', es: '¡Hola! 👋 ¡Bienvenido!', zh: '你好！👋 欢迎！', ar: 'مرحبًا! 👋 أهلاً وسهلاً!', ja: 'こんにちは！👋 ようこそ！' },
  salesEmptyDesc: { en: 'I can visualize your data with charts, analyze pipeline performance, and suggest improvements. To create proposals, head to the Proposals page.', sv: 'Jag kan visualisera din data med diagram, analysera pipeline-prestanda och föreslå förbättringar. För att skapa offerter, gå till Offertsidan.', de: 'Ich kann Ihre Daten mit Diagrammen visualisieren, die Pipeline-Performance analysieren und Verbesserungen vorschlagen.', fr: "Je peux visualiser vos données avec des graphiques, analyser les performances du pipeline et suggérer des améliorations.", es: 'Puedo visualizar tus datos con gráficos, analizar el rendimiento del pipeline y sugerir mejoras.', zh: '我可以用图表可视化您的数据，分析业务管道表现，并提出改进建议。', ar: 'يمكنني عرض بياناتك بالرسوم البيانية، تحليل أداء خط الأنابيب واقتراح تحسينات.', ja: 'チャートでデータを可視化し、パイプラインのパフォーマンスを分析し、改善を提案できます。' },
  guestEmptyDesc: { en: "I'm your friendly hotel concierge — think of me as the person who knows all the best rooms, the tastiest menus, and the secret to a perfect event. Let's make something amazing! ✨", sv: 'Jag är din vänliga hotellconcierge — tänk på mig som den som känner till de bästa rummen, godaste menyerna och hemligheten till ett perfekt event. Låt oss skapa något fantastiskt! ✨', de: 'Ich bin Ihr freundlicher Hotel-Concierge — ich kenne die besten Zimmer, leckersten Menüs und das Geheimnis perfekter Events. Lassen Sie uns etwas Großartiges schaffen! ✨', fr: "Je suis votre concierge d'hôtel — pensez à moi comme celui qui connaît les meilleures chambres, les menus les plus savoureux et le secret d'un événement parfait. Créons quelque chose d'incroyable ! ✨", es: 'Soy tu concierge del hotel — piensa en mí como quien conoce las mejores habitaciones, los menús más sabrosos y el secreto de un evento perfecto. ¡Hagamos algo increíble! ✨', zh: '我是您友好的酒店礼宾——我了解最好的房间、最美味的菜单和完美活动的秘密。让我们一起创造美好体验！✨', ar: 'أنا كونسيرج الفندق الودود — فكّر بي كمن يعرف أفضل الغرف وأشهى الأطباق وسر الحدث المثالي. لنصنع شيئًا رائعًا! ✨', ja: '私はフレンドリーなホテルコンシェルジュ——最高の部屋、最高のメニュー、完璧なイベントの秘密を知っています。素晴らしい体験を一緒に作りましょう！✨' },
  salesDraftEmptyNote: { en: 'Sales AI can also generate proposal drafts and create proposals after your confirmation.', sv: 'Sälj-AI kan också generera offertförslag och skapa offerter efter din bekräftelse.', de: 'Die Verkaufs-KI kann auch Angebotsentwürfe generieren und nach Ihrer Bestätigung erstellen.', fr: "L'IA peut aussi générer des brouillons et créer des propositions après confirmation.", es: 'La IA también puede generar borradores y crear propuestas tras su confirmación.', zh: '销售AI还可以生成提案草稿，并在您确认后创建提案。', ar: 'يمكن لذكاء المبيعات أيضًا إنشاء مسودات وإنشاء عروض بعد تأكيدك.', ja: '営業AIは提案の下書きを作成し、確認後に提案を作成することもできます。' },
  quickBooking: { en: 'Quick Event Booking', sv: 'Snabb Eventbokning', de: 'Schnelle Eventbuchung', fr: 'Réservation Rapide', es: 'Reserva Rápida de Evento', zh: '快速活动预订', ar: 'حجز سريع للفعالية', ja: 'クイックイベント予約' },
  quickBookingDesc: { en: 'Fill in the details below to generate an accurate proposal', sv: 'Fyll i uppgifterna nedan för att generera en korrekt offert', de: 'Füllen Sie die Details aus, um ein genaues Angebot zu erstellen', fr: 'Remplissez les détails ci-dessous pour générer une proposition précise', es: 'Complete los detalles abajo para generar una propuesta precisa', zh: '填写以下详细信息以生成准确的提案', ar: 'املأ التفاصيل أدناه لإنشاء عرض دقيق', ja: '正確な提案を作成するために、以下の詳細を入力してください' },
};

const SALES_SUGGESTIONS_I18N: Record<LangCode, string[]> = {
  en: ['Show me a chart of proposals by status', 'Visualize revenue trend by month', 'Show my win rate trend over time', 'What are my top companies by proposal count?', 'Show a pipeline funnel of my proposals', 'How can I improve my conversion rate?', 'Compare this quarter vs last quarter', 'Which proposals need follow-up?'],
  sv: ['Visa ett diagram över offerter per status', 'Visualisera intäktstrend per månad', 'Visa min vinstrat-trend över tid', 'Vilka är mina toppföretag per offertantal?', 'Visa en pipeline-tratt för mina offerter', 'Hur kan jag förbättra min konverteringsgrad?', 'Jämför detta kvartal med förra kvartalet', 'Vilka offerter behöver uppföljning?'],
  de: ['Zeig mir ein Diagramm der Angebote nach Status', 'Umsatztrend nach Monat visualisieren', 'Zeig meinen Gewinnraten-Trend', 'Welche sind meine Top-Unternehmen nach Angebotsanzahl?', 'Pipeline-Trichter meiner Angebote zeigen', 'Wie kann ich meine Konversionsrate verbessern?', 'Dieses Quartal mit letztem vergleichen', 'Welche Angebote brauchen Follow-up?'],
  fr: ['Montre-moi un graphique des propositions par statut', 'Visualiser la tendance de revenus par mois', 'Montrer l\'évolution de mon taux de réussite', 'Quelles sont mes meilleures entreprises par nombre de propositions ?', 'Afficher l\'entonnoir pipeline de mes propositions', 'Comment améliorer mon taux de conversion ?', 'Comparer ce trimestre au précédent', 'Quelles propositions nécessitent un suivi ?'],
  es: ['Muéstrame un gráfico de propuestas por estado', 'Visualizar tendencia de ingresos por mes', 'Mostrar mi tendencia de tasa de éxito', '¿Cuáles son mis principales empresas por número de propuestas?', 'Mostrar embudo del pipeline', '¿Cómo puedo mejorar mi tasa de conversión?', 'Comparar este trimestre con el anterior', '¿Qué propuestas necesitan seguimiento?'],
  zh: ['按状态显示提案图表', '按月可视化收入趋势', '显示我的赢率趋势', '按提案数量排名的公司有哪些？', '显示我的提案漏斗', '如何提高转化率？', '本季度与上季度对比', '哪些提案需要跟进？'],
  ar: ['أظهر لي رسمًا بيانيًا للعروض حسب الحالة', 'عرض اتجاه الإيرادات حسب الشهر', 'أظهر اتجاه معدل الفوز عبر الزمن', 'ما هي أفضل شركاتي حسب عدد العروض؟', 'عرض قمع خط الأنابيب لعروضي', 'كيف يمكنني تحسين معدل التحويل؟', 'مقارنة هذا الربع بالربع السابق', 'أي العروض تحتاج متابعة؟'],
  ja: ['ステータス別の提案チャートを表示', '月別の収益トレンドを可視化', '成約率のトレンドを表示', '提案数トップの企業は？', '提案のパイプラインファネルを表示', 'コンバージョン率を改善するには？', '今四半期と前四半期を比較', 'フォローアップが必要な提案は？'],
};

const GUEST_SUGGESTIONS_I18N: Record<LangCode, string[]> = {
  en: ['I want to book an event — help me get started! 🎉', 'What are your room rates and packages? 💰', 'Show me your facilities — ballrooms, boardrooms, gardens 🏨', 'What meals and catering options do you offer? 🍽️', 'Do you provide transportation or shuttle services? 🚗', 'I want to make changes to an existing booking ✏️', 'What conference rooms do you have with AV setup? 🎓', 'Plan a wedding reception for 150 guests 💒'],
  sv: ['Jag vill boka ett event — hjälp mig komma igång! 🎉', 'Vad kostar era rum och paket? 💰', 'Visa mig era lokaler — festsalar, mötesrum, trädgårdar 🏨', 'Vilka måltider och catering erbjuder ni? 🍽️', 'Erbjuder ni transport eller shuttleservice? 🚗', 'Jag vill ändra en befintlig bokning ✏️', 'Vilka konferensrum med AV-utrustning har ni? 🎓', 'Planera en bröllopsmottagning för 150 gäster 💒'],
  de: ['Ich möchte ein Event buchen — hilf mir beim Start! 🎉', 'Was kosten Ihre Zimmer und Pakete? 💰', 'Zeigen Sie mir Ihre Räumlichkeiten — Ballsäle, Konferenzräume, Gärten 🏨', 'Welche Mahlzeiten und Catering-Optionen bieten Sie? 🍽️', 'Bieten Sie Transport oder Shuttle-Service? 🚗', 'Ich möchte eine bestehende Buchung ändern ✏️', 'Welche Konferenzräume mit AV-Ausstattung haben Sie? 🎓', 'Planen Sie einen Hochzeitsempfang für 150 Gäste 💒'],
  fr: ['Je veux réserver un événement — aidez-moi à commencer ! 🎉', 'Quels sont vos tarifs et forfaits ? 💰', 'Montrez-moi vos installations — salles de bal, salles de réunion, jardins 🏨', 'Quelles options de restauration proposez-vous ? 🍽️', 'Proposez-vous un service de transport ou navette ? 🚗', 'Je veux modifier une réservation existante ✏️', 'Quelles salles de conférence avec équipement AV avez-vous ? 🎓', 'Planifier une réception de mariage pour 150 invités 💒'],
  es: ['¡Quiero reservar un evento — ayúdame a empezar! 🎉', '¿Cuáles son sus tarifas y paquetes? 💰', 'Muéstrame sus instalaciones — salones, salas de juntas, jardines 🏨', '¿Qué opciones de comida y catering ofrecen? 🍽️', '¿Ofrecen transporte o servicio de traslado? 🚗', 'Quiero hacer cambios en una reserva existente ✏️', '¿Qué salas de conferencia con equipo AV tienen? 🎓', 'Planear una recepción de boda para 150 invitados 💒'],
  zh: ['我想预订一个活动——帮我开始吧！🎉', '你们的房间价格和套餐是什么？💰', '给我看看你们的设施——宴会厅、会议室、花园 🏨', '你们提供什么餐饮选择？🍽️', '你们提供交通或接送服务吗？🚗', '我想修改一个现有预订 ✏️', '你们有哪些带AV设备的会议室？🎓', '为150位宾客策划一场婚礼招待会 💒'],
  ar: ['أريد حجز فعالية — ساعدني في البدء! 🎉', 'ما هي أسعار الغرف والباقات؟ 💰', 'أرني المرافق — قاعات، غرف اجتماعات، حدائق 🏨', 'ما خيارات الطعام والتموين المتوفرة؟ 🍽️', 'هل توفرون خدمة النقل أو التوصيل؟ 🚗', 'أريد تعديل حجز موجود ✏️', 'ما قاعات المؤتمرات المجهزة بأنظمة AV؟ 🎓', 'تخطيط حفل زفاف لـ150 ضيفًا 💒'],
  ja: ['イベントを予約したい——手伝ってください！🎉', '客室料金とパッケージは？💰', '施設を見せて——ボールルーム、会議室、庭園 🏨', 'どんな食事とケータリングがありますか？🍽️', '送迎サービスはありますか？🚗', '既存の予約を変更したい ✏️', 'AV設備付きの会議室はありますか？🎓', '150名の結婚披露宴を計画 💒'],
};

function t(key: string, lang: string): string {
  const langCode = (lang || 'en') as LangCode;
  return UI_STRINGS[key]?.[langCode] ?? UI_STRINGS[key]?.en ?? key;
}

function getSuggestions(isSales: boolean, lang: string): string[] {
  const langCode = (lang || 'en') as LangCode;
  return isSales
    ? (SALES_SUGGESTIONS_I18N[langCode] ?? SALES_SUGGESTIONS_I18N.en)
    : (GUEST_SUGGESTIONS_I18N[langCode] ?? GUEST_SUGGESTIONS_I18N.en);
}

// ─── LocalStorage helpers (user-scoped) ───

function getStorageKey(userId?: string | null): string {
  return userId ? `proposales_conversations_${userId}` : 'proposales_conversations';
}

let _currentStorageKey = 'proposales_conversations';

function setCurrentUser(userId?: string | null) {
  _currentStorageKey = getStorageKey(userId);
}

function loadConversations(): StoredConversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(_currentStorageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistConversations(conversations: StoredConversation[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(_currentStorageKey, JSON.stringify(conversations));
}

function persistConversation(id: string, title: string, messages: UIMessage[]) {
  const convs = loadConversations();
  const idx = convs.findIndex((c) => c.id === id);
  const now = Date.now();
  if (idx >= 0) {
    convs[idx].messages = messages;
    convs[idx].updatedAt = now;
    if (title) convs[idx].title = title;
  } else {
    convs.unshift({ id, title, createdAt: now, updatedAt: now, messages });
  }
  persistConversations(convs);
}

function deleteStoredConversation(id: string) {
  const convs = loadConversations().filter((c) => c.id !== id);
  persistConversations(convs);
}

// ─── Suggestions ───

const SALES_SUGGESTIONS = [
  'Show me a chart of proposals by status',
  'Visualize revenue trend by month',
  'Show my win rate trend over time',
  'What are my top companies by proposal count?',
  'Show a pipeline funnel of my proposals',
  'How can I improve my conversion rate?',
  'Compare this quarter vs last quarter',
  'Which proposals need follow-up?',
];

const GUEST_SUGGESTIONS = [
  'I want to book an event — help me get started! 🎉',
  'What are your room rates and packages? 💰',
  'Show me your facilities — ballrooms, boardrooms, gardens 🏨',
  'What meals and catering options do you offer? 🍽️',
  'Do you provide transportation or shuttle services? 🚗',
  'I want to make changes to an existing booking ✏️',
  'What conference rooms do you have with AV setup? 🎓',
  'Plan a wedding reception for 150 guests 💒',
];

// ─── Restore stored messages to UIMessage format ───

function restoreMessages(msgs: unknown[]): UIMessage[] {
  if (!Array.isArray(msgs)) return [];
  return msgs.map((m: unknown) => {
    const msg = m as Record<string, unknown>;
    const id = (msg.id as string) || crypto.randomUUID();
    const role = (msg.role as UIMessage['role']) || 'assistant';
    const content = (typeof msg.content === 'string' ? msg.content : '') as string;
    const parts = Array.isArray(msg.parts) && msg.parts.length > 0
      ? msg.parts
      : content
        ? [{ type: 'text' as const, text: content }]
        : [];
    return { id, role, parts, createdAt: msg.createdAt ? new Date(msg.createdAt as number) : new Date() } as UIMessage;
  });
}

// ─── Main Component ───

export default function AIAssistantPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState('');
  const [chatMode, setChatMode] = useState<'conversation' | 'form'>('conversation');
  const [streamStalled, setStreamStalled] = useState(false);
  const [language] = useState(() => {
    if (typeof window !== 'undefined') {
      const browserLang = navigator.language?.split('-')[0];
      const match = LANGUAGES.find((l) => l.code === browserLang);
      return match ? match.code : 'en';
    }
    return 'en';
  });
  const [isListening, setIsListening] = useState(false);
  const [isBootstrappingConversations, setIsBootstrappingConversations] = useState(true);
  const recognitionRef = useRef<any>(null);
  const hasBootstrappedConversationsRef = useRef(false);
  const { data: userData } = useUser();
  const isSales = userData?.role === 'sales';
  const suggestions = getSuggestions(isSales, language);

  const activeConversation = conversations.find((c) => c.id === activeConvId);

  const {
    messages,
    sendMessage,
    status,
    setMessages,
    stop,
  } = useChat({
    id: activeConvId,
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { conversationId: activeConvId, language },
    }),
    messages: activeConversation?.messages ?? [],
    onError() {
      setStreamStalled(true);
    },
    onFinish() {
      setStreamStalled(false);
      // no-op: source of truth is server conversation state
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(streamTimeoutRef.current);

    if (isLoading) {
      setStreamStalled(false);
      streamTimeoutRef.current = setTimeout(() => {
        stop();
        setStreamStalled(true);
      }, 45_000);
    } else {
      setStreamStalled(false);
    }

    return () => clearTimeout(streamTimeoutRef.current);
  }, [isLoading, stop]);

  const acceptedDraftKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const message of messages) {
      if (!Array.isArray(message.parts)) continue;

      for (const part of message.parts) {
        if ((part as { type?: string }).type !== 'tool-acceptProposal') continue;

        const toolPart = part as unknown as ToolPart;
        if (toolPart.state !== 'output-available' || !toolPart.output || typeof toolPart.output !== 'object') {
          continue;
        }

        const output = toolPart.output as {
          type?: string;
          proposal?: { title?: string; proposalUuid?: string | null; status?: string };
          recipient?: { email?: string };
        };

        if (output.type !== 'proposal_status') continue;
        if (!output.proposal?.proposalUuid || output.proposal?.status === 'error') continue;

        const title = output.proposal.title?.trim();
        const email = output.recipient?.email?.trim().toLowerCase();
        if (!title || !email) continue;

        keys.add(`${title}::${email}`);
      }
    }

    return keys;
  }, [messages]);

  const createConversationOnServer = useCallback(async (title = 'New Chat') => {
    const response = await fetch('/api/ai/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }
    const payload = await response.json() as { data: StoredConversation };
    const conversation: StoredConversation = {
      ...payload.data,
      messages: payload.data.messages ?? [],
    };
    setConversations((prev) => [conversation, ...prev.filter((c) => c.id !== conversation.id)]);
    setActiveConvId(conversation.id);
    setMessages([]);
    return conversation;
  }, [setMessages]);

  useEffect(() => {
    let mounted = true;
    if (!userData?.authenticated) {
      hasBootstrappedConversationsRef.current = false;
      setIsBootstrappingConversations(false);
      return;
    }
    if (hasBootstrappedConversationsRef.current) {
      setIsBootstrappingConversations(false);
      return;
    }
    hasBootstrappedConversationsRef.current = true;

    const bootstrapConversations = async () => {
      setIsBootstrappingConversations(true);
      try {
        const response = await fetch('/api/ai/conversations');
        if (!response.ok) throw new Error('Failed to load conversations');
        const payload = await response.json() as { data: StoredConversation[] };
        const serverConversations = (payload.data ?? []).map((conversation) => ({
          ...conversation,
          messages: restoreMessages(conversation.messages ?? []),
        }));
        if (!mounted) return;
        setConversations(serverConversations);
        if (serverConversations.length > 0) {
          setActiveConvId(serverConversations[0].id);
          setMessages(serverConversations[0].messages ?? []);
        } else {
          const created = await createConversationOnServer('New Chat');
          if (!mounted) return;
          setActiveConvId(created.id);
          setMessages(created.messages ?? []);
        }
      } catch {
        if (!mounted) return;
        setConversations([]);
        hasBootstrappedConversationsRef.current = false;
      } finally {
        if (mounted) setIsBootstrappingConversations(false);
      }
    };

    void bootstrapConversations();
    return () => {
      mounted = false;
    };
  }, [userData?.authenticated, createConversationOnServer, setMessages]);

  const visibleMessages = useMemo(
    () => messages.filter((message) => isRenderableMessage(message)),
    [messages],
  );

  // Save messages to server when they change — debounced and only after streaming completes
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (activeConvId && messages.length > 0) {
      const title = generateTitle(messages);
      const nextSignature = messages
        .map((message) => `${message.id}:${message.role}:${getMessageText(message)}`)
        .join('|');

      setConversations((prev) => {
        const existingIndex = prev.findIndex((conversation) => conversation.id === activeConvId);
        if (existingIndex >= 0) {
          const existing = prev[existingIndex];
          const currentSignature = existing.messages
            .map((message) => `${message.id}:${message.role}:${getMessageText(message)}`)
            .join('|');
          const sameTitle = existing.title === title;
          const sameMessages = currentSignature === nextSignature;

          if (sameTitle && sameMessages) {
            return prev;
          }

          const next = [...prev];
          next[existingIndex] = {
            ...existing,
            title,
            messages,
            updatedAt: sameMessages ? existing.updatedAt : Date.now(),
          };
          return next;
        }

        const newConv: StoredConversation = {
          id: activeConvId,
          title,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages,
        };
        return [newConv, ...prev];
      });

      // Debounce the server PUT to avoid spamming during streaming
      clearTimeout(saveTimerRef.current);
      if (!isLoading) {
        saveTimerRef.current = setTimeout(() => {
          fetch(`/api/ai/conversations/${activeConvId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              messages: messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: getMessageText(m),
                parts: (m as unknown as { parts?: unknown[] }).parts ?? [],
                createdAt: Date.now(),
              })),
            }),
          }).catch(() => {});
        }, 500);
      }
    }
    return () => clearTimeout(saveTimerRef.current);
  }, [messages, activeConvId, isLoading]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleNewChat = useCallback(async () => {
    await createConversationOnServer('New Chat');
  }, [createConversationOnServer]);

  async function handleSelectConversation(id: string) {
    setActiveConvId(id);
    const conv = conversations.find((c) => c.id === id);
    if (conv?.messages?.length) {
      setMessages(conv.messages);
      return;
    }
    try {
      const response = await fetch(`/api/ai/conversations/${id}`);
      if (!response.ok) return;
      const payload = await response.json() as { data: StoredConversation };
      const loaded = payload.data;
      const restored = restoreMessages(loaded.messages ?? []);
      setConversations((prev) => prev.map((conversation) => (
        conversation.id === id
          ? { ...conversation, messages: restored }
          : conversation
      )));
      setMessages(restored);
    } catch {
      setMessages([]);
    }
  }

  function handleDeleteConversation(id: string) {
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    if (activeConvId === id) {
      if (updated.length > 0) {
        setActiveConvId(updated[0].id);
        setMessages(updated[0].messages);
      } else {
        void createConversationOnServer('New Chat');
      }
    }
    fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  const handleAccept = useCallback((esignUrl?: string | null) => {
    if (esignUrl && typeof window !== 'undefined') {
      window.open(esignUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    sendMessage({ text: '[ACTION:ACCEPT_PROPOSAL]' });
  }, [sendMessage]);

  const handleReject = useCallback(() => {
    sendMessage({ text: '[ACTION:REJECT_PROPOSAL]' });
  }, [sendMessage]);

  const handleNegotiate = useCallback((draft: ProposalDraft) => {
    const payload = {
      proposal_uuid: draft.proposalUuid ?? '',
      title: draft.title,
      description: draft.description,
      currency: draft.currency,
      recipient_name: draft.recipient.name,
      recipient_email: draft.recipient.email,
      recipient_company: draft.recipient.company,
      company_id: draft.company_id,
      language: draft.language,
      current_negotiation_round: draft.negotiation_round ?? 0,
      notes: draft.notes,
      venue_type: draft.venue_type ?? undefined,
    };
    sendMessage({ text: `[ACTION:NEGOTIATE] ${JSON.stringify(payload)}` });
  }, [sendMessage]);

  const handleFormSubmit = useCallback((formData: EventFormData) => {
    const normalizedGuests = Number.parseInt(formData.guests || '0', 10);
    const selectedItems = formData.selectedItems.map((item) => ({
      variation_id: item.variation_id,
      title: item.title,
      quantity: item.quantity,
      unit_type: item.unit_type,
      price_cents: item.price_cents,
    }));

    const extras: string[] = [];
    if (formData.catering) extras.push('catering/food service');
    if (formData.av) extras.push('AV equipment (projector, sound system)');
    if (formData.accommodation) extras.push('overnight accommodation for guests');
    if (formData.decoration) extras.push('venue decoration');
    if (formData.transportation) extras.push('transportation');

    const submission = {
      event_type: formData.eventType,
      event_date: formData.date,
      guests: Number.isFinite(normalizedGuests) ? normalizedGuests : formData.guests,
      time_slot: formData.time || undefined,
      venue_type: formData.venue || undefined,
      setup_type: formData.setupType || undefined,
      budget_eur: formData.budget ? Number.parseFloat(formData.budget) : undefined,
      notes: formData.notes || undefined,
      contact_name: formData.name || undefined,
      contact_email: formData.email || undefined,
      selected_space: formData.selectedSpace
        ? {
          space_id: formData.selectedSpace.space_id,
          space_name: formData.selectedSpace.space_name,
          space_type: formData.selectedSpace.space_type,
          time_slot_id: formData.selectedSpace.time_slot_id,
          time_slot: formData.selectedSpace.time_slot,
          capacity: formData.selectedSpace.capacity,
        }
        : undefined,
      selected_items: selectedItems.length > 0 ? selectedItems : undefined,
      requested_extras: selectedItems.length === 0 && extras.length > 0 ? extras : undefined,
    };

    const instructions = [
      '[FORM_SUBMISSION]',
      'The booking form is already completed with event type, date, and guests.',
      'Do NOT call requestUserInput again.',
      formData.selectedSpace
        ? 'Use selected_space directly. Only call checkAvailability if you need to validate or suggest alternatives.'
        : 'Call checkAvailability next and suggest best-fit spaces.',
      'Then generateProposalDraft using selected_items (variation_id + quantity) when provided.',
      `FORM_DATA: ${JSON.stringify(submission)}`,
    ];

    sendMessage({ text: instructions.join('\n') });
    setChatMode('conversation');
  }, [sendMessage]);

  // ─── Voice Mode ───
  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'en' ? 'en-US' : language;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    let finalTranscript = '';
    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      setInput(`${finalTranscript} ${interimTranscript}`.trim());
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => {
      setIsListening(false);
      const transcript = finalTranscript.trim();
      if (transcript) {
        sendMessage({ text: transcript });
        setInput('');
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, language, sendMessage]);

  useEffect(() => () => {
    recognitionRef.current?.stop?.();
  }, []);

  const hasVoiceSupport = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Conversation Sidebar */}
      <aside
        className={cn(
          'flex w-72 flex-col border-r border-gray-200/80 bg-gradient-to-b from-white to-gray-50/50 transition-all duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full absolute lg:relative',
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-sm font-semibold text-gray-800">{t('conversations', language)}</span>
          <button
            onClick={handleNewChat}
            className="group flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition-all duration-200 hover:bg-gray-200 hover:scale-105 active:scale-95"
            title={t('newChat', language)}
          >
            <svg className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>
              <p className="text-xs font-medium text-gray-500">{t('noConversations', language)}</p>
              <p className="mt-1 text-[0.65rem] text-gray-400">{t('startTyping', language)}</p>
            </div>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                'chat-conv-item group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 mb-0.5 transition-all duration-200',
                activeConvId === conv.id
                  ? 'bg-gray-100 shadow-sm'
                  : 'hover:bg-gray-100/70',
              )}
              onClick={() => handleSelectConversation(conv.id)}
            >
              <div className={cn(
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
                activeConvId === conv.id ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-400',
              )}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  'truncate text-sm font-medium',
                  activeConvId === conv.id ? 'text-gray-900' : 'text-gray-700',
                )}>{conv.title}</p>
                <p className="text-[0.65rem] text-gray-400">
                  {formatRelativeTime(conv.updatedAt)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteConversation(conv.id);
                }}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg opacity-0 transition-all duration-200 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 text-gray-400"
                title={t('deleteConversation', language)}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col bg-gray-50/30">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-200/80 bg-white/80 backdrop-blur-sm px-6 py-3.5">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 shadow-sm">
            <svg className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">{isSales ? t('salesTitle', language) : t('guestTitle', language)}</h2>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              <p className="text-xs text-gray-500">{isSales ? t('salesSubtitle', language) : t('guestSubtitle', language)}</p>
            </div>
            {isSales && (
              <p className="mt-0.5 text-[11px] font-medium text-gray-600">
                {t('salesDraftNote', language)}
              </p>
            )}
          </div>
          {/* Mode toggle */}
          {
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 p-0.5">
              <button
                onClick={() => setChatMode('conversation')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  chatMode === 'conversation'
                    ? 'bg-white text-gray-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                {t('chatMode', language)}
              </button>
              <button
                onClick={() => setChatMode('form')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  chatMode === 'form'
                    ? 'bg-white text-gray-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
                {t('formMode', language)}
              </button>
              </div>
            </div>
          }
        </div>

        {/* Messages or Form */}
        {chatMode === 'form' ? (
          <EventBookingForm onSubmit={handleFormSubmit} isLoading={isLoading} userData={userData} language={language} />
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 space-y-5">
              {visibleMessages.length === 0 && !isBootstrappingConversations && (
                <EmptyState suggestions={suggestions} onSelect={setInput} isSales={isSales} language={language} />
              )}

              {visibleMessages.map((message, idx) => (
                <div key={message.id} className="chat-msg-enter" style={{ animationDelay: `${Math.min(idx * 30, 200)}ms` }}>
                  <ChatMessage
                    message={message}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    onNegotiate={handleNegotiate}
                    onSendStructuredInput={(textPayload) => sendMessage({ text: textPayload })}
                    acceptedDraftKeys={acceptedDraftKeys}
                    isLoading={isLoading}
                  />
                </div>
              ))}

              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <TypingIndicator />
              )}
            </div>

            {/* Input */}
            <div className="border-t border-gray-200/80 bg-white px-4 py-3 sm:px-6 sm:py-4">
              <form
                onSubmit={(e) => { e.preventDefault(); if (input.trim()) { sendMessage({ text: input }); setInput(''); } }}
                className="chat-input-wrapper group relative flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50/50 px-4 transition-all duration-300 focus-within:border-gray-400 focus-within:bg-white focus-within:shadow-lg focus-within:shadow-gray-900/5"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isSales ? t('salesPlaceholder', language) : t('guestPlaceholder', language)}
                  className="flex-1 h-12 bg-transparent text-sm placeholder:text-gray-400 focus:outline-none"
                  disabled={isLoading}
                />

                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm transition-all duration-200 hover:bg-gray-800 hover:shadow-md hover:shadow-gray-900/25 disabled:opacity-30 disabled:hover:bg-gray-900 disabled:hover:shadow-sm active:scale-95"
                >
                  {isLoading ? (
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  )}
                </button>
              </form>
              <p className="mt-2 text-center text-[0.65rem] text-gray-400">
                {t('aiDisclaimer', language)}
              </p>
              {streamStalled && (
                <p className="mt-1 text-center text-[0.7rem] text-amber-600">
                  {t('timedOut', language)}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Types for Form Mode ───

interface SelectedContentItem {
  variation_id: number;
  title: string;
  price_cents: number;
  unit_type: string;
  quantity: number;
}

interface SelectedSpace {
  space_id: string;
  space_name: string;
  space_type: string;
  capacity: number;
  price: string;
  price_cents: number;
  time_slot_id: string;
  time_slot: string;
  amenities: string[];
}

interface EventFormData {
  eventType: string;
  venue: string;
  date: string;
  time: string;
  guests: string;
  setupType: string;
  budget: string;
  catering: boolean;
  av: boolean;
  accommodation: boolean;
  decoration: boolean;
  transportation: boolean;
  name: string;
  email: string;
  notes: string;
  selectedSpace: SelectedSpace | null;
  selectedItems: SelectedContentItem[];
}

const EVENT_TYPES = [
  { value: 'conference', label: 'Conference', icon: '🎤' },
  { value: 'stay', label: 'Stay', icon: '🛏️' },
  { value: 'wedding', label: 'Wedding', icon: '💍' },
  { value: 'meeting', label: 'Business Meeting', icon: '🤝' },
  { value: 'dinner', label: 'Dinner / Gala', icon: '🍽️' },
  { value: 'party', label: 'Party / Celebration', icon: '🎉' },
  { value: 'workshop', label: 'Workshop / Training', icon: '📋' },
];

const VENUE_OPTIONS = [
  { value: 'room', label: 'Hotel Room / Suite', icon: '🏨', desc: 'Luxury stay with amenities' },
  { value: 'boardroom', label: 'Boardroom', icon: '💼', desc: '10-20 pax, intimate setting' },
  { value: 'conference', label: 'Conference Room', icon: '🖥️', desc: '30-50 pax, full AV setup' },
  { value: 'banquet', label: 'Banquet Hall', icon: '🎊', desc: '100-500 pax, elegant décor' },
  { value: 'garden', label: 'Garden / Outdoor', icon: '🌿', desc: 'Open air, scenic views' },
  { value: 'restaurant', label: 'Restaurant / Dining', icon: '🍷', desc: 'Fine dining & catering' },
];

const TIME_OPTIONS = [
  { value: 'morning', label: 'Morning (8AM - 12PM)' },
  { value: 'afternoon', label: 'Afternoon (12PM - 5PM)' },
  { value: 'evening', label: 'Evening (5PM - 10PM)' },
  { value: 'full-day', label: 'Full Day' },
];

const SETUP_OPTIONS = [
  { value: 'theater', label: 'Theater' },
  { value: 'classroom', label: 'Classroom' },
  { value: 'banquet', label: 'Banquet' },
  { value: 'cocktail', label: 'Cocktail' },
  { value: 'boardroom', label: 'Boardroom' },
  { value: 'u-shape', label: 'U-Shape' },
];

// ─── Content Item Categories ───
type AddonCategory = 'meals' | 'av' | 'decoration' | 'accommodation' | 'transportation';

const ADDON_CATEGORIES: { key: AddonCategory; formKey: keyof EventFormData; label: string; icon: string }[] = [
  { key: 'meals', formKey: 'catering', label: 'Catering & Food', icon: '🍽️' },
  { key: 'av', formKey: 'av', label: 'AV Equipment', icon: '🎙️' },
  { key: 'accommodation', formKey: 'accommodation', label: 'Guest Accommodation', icon: '🛏️' },
  { key: 'decoration', formKey: 'decoration', label: 'Decoration & Setup', icon: '🎨' },
  { key: 'transportation', formKey: 'transportation', label: 'Transportation', icon: '🚐' },
];

const CONTENT_CATEGORY_KEYWORDS: Record<AddonCategory, string[]> = {
  meals: ['breakfast', 'lunch', 'dinner', 'all meals', 'full board', 'coffee', 'snacks'],
  av: ['projector', 'microphone', 'speaker', 'sound'],
  decoration: ['stage', 'decor', 'decoration'],
  accommodation: ['single room', 'double room', 'suite'],
  transportation: ['transportation'],
};

function categorizeContentItem(title: string): AddonCategory | 'venue' | null {
  const lower = title.toLowerCase();
  if (lower.includes('boardroom') || lower.includes('banquet') || lower.includes('conference') || lower.includes('garden') || lower.includes('restaurant') || lower.includes('pool')) return 'venue';
  for (const [cat, keywords] of Object.entries(CONTENT_CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat as AddonCategory;
  }
  return null;
}

// ─── Types for form APIs ───
interface ContentItem {
  id: number;
  variation_id: number;
  title: string | Record<string, unknown>;
  description?: string;
  unit_value_with_tax?: number;
  product_id?: number;
}

function toDisplayText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  if (typeof record.en === 'string') return record.en;

  for (const candidate of Object.values(record)) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return '';
}

interface CalendarDay {
  date: string;
  day: number;
  dow: number;
  status: 'available' | 'limited' | 'booked';
  available_count: number;
  total_count: number;
}

interface CalendarHold {
  date: string;
  space_id: string;
  space_name: string;
  time_slot_id: string;
  expires_at: string;
  status: string;
}

interface AvailabilityResult {
  space_id: string;
  space_name: string;
  space_type: string;
  capacity: number;
  date: string;
  time_slot: string;
  time_slot_id: string;
  price: string;
  price_cents: number;
  amenities: string[];
}

function matchesSpaceForEventType(slot: AvailabilityResult, eventType: string): boolean {
  if (!eventType) return true;

  const normalizedType = eventType.toLowerCase();
  const normalizedSpaceType = slot.space_type.toLowerCase();
  const normalizedSpaceName = slot.space_name.toLowerCase();

  if (normalizedType === 'stay') {
    return ['room', 'suite', 'single', 'deluxe'].some((keyword) => normalizedSpaceName.includes(keyword));
  }

  if (normalizedType === 'conference' || normalizedType === 'workshop') {
    return normalizedSpaceType === 'conference' || normalizedSpaceType === 'boardroom';
  }

  if (normalizedType === 'meeting') {
    return normalizedSpaceType === 'boardroom' || normalizedSpaceType === 'conference';
  }

  if (normalizedType === 'wedding') {
    return normalizedSpaceType === 'banquet' || normalizedSpaceType === 'outdoor';
  }

  if (normalizedType === 'dinner') {
    return normalizedSpaceType === 'restaurant' || normalizedSpaceType === 'banquet';
  }

  if (normalizedType === 'party') {
    return normalizedSpaceType === 'banquet' || normalizedSpaceType === 'outdoor' || normalizedSpaceType === 'restaurant';
  }

  return true;
}

function EventBookingForm({
  onSubmit,
  isLoading,
  userData,
  language,
}: {
  onSubmit: (data: EventFormData) => void;
  isLoading: boolean;
  userData?: { name: string | null; email: string | null } | undefined;
  language: string;
}) {
  const [form, setForm] = useState<EventFormData>({
    eventType: '',
    venue: '',
    date: '',
    time: '',
    guests: '',
    setupType: '',
    budget: '',
    catering: false,
    av: false,
    accommodation: false,
    decoration: false,
    transportation: false,
    name: '',
    email: '',
    notes: '',
    selectedSpace: null,
    selectedItems: [],
  });

  // ─── Content Catalog State ───
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [contentLoading, setContentLoading] = useState(true);

  // Categorized content items for add-on selection
  const categorizedItems = useMemo(() => {
    const result: Record<AddonCategory, { variation_id: number; title: string; price_cents: number; unit_type: string }[]> = {
      meals: [], av: [], decoration: [], accommodation: [], transportation: [],
    };
    for (const item of contentItems) {
      const title = toDisplayText(item.title);
      const cat = categorizeContentItem(title);
      if (cat && cat !== 'venue' && result[cat]) {
        const price = item.unit_value_with_tax ?? 0;
        const cp = getContentPriceForForm(title);
        result[cat].push({
          variation_id: item.variation_id || item.id,
          title,
          price_cents: price > 0 ? price : (cp?.price_cents ?? 0),
          unit_type: cp?.unit_type ?? 'unit',
        });
      }
    }
    return result;
  }, [contentItems]);

  // ─── Calendar State ───
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [calendarHolds, setCalendarHolds] = useState<CalendarHold[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [calendarSummary, setCalendarSummary] = useState<{ available: number; limited: number; booked: number; active_holds: number } | null>(null);

  // ─── Live Availability State ───
  const [availability, setAvailability] = useState<AvailabilityResult[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // Populate name and email from login data on mount
  useEffect(() => {
    if (userData?.name || userData?.email) {
      setForm((prev) => ({
        ...prev,
        name: userData.name || '',
        email: userData.email || '',
      }));
    }
  }, [userData?.name, userData?.email]);

  // Fetch content catalog on mount
  useEffect(() => {
    setContentLoading(true);
    fetch('/api/proposales/content')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const items = data?.data || [];
        setContentItems(items.slice(0, 20));
      })
      .catch(() => {})
      .finally(() => setContentLoading(false));
  }, []);

  // Fetch calendar when month/year changes or when guests change
  useEffect(() => {
    setCalendarLoading(true);
    const params = new URLSearchParams({
      year: String(calendarMonth.year),
      month: String(calendarMonth.month),
    });
    if (form.guests) params.set('guests', form.guests);
    fetch(`/api/mock-pms/calendar?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setCalendarDays(data.days || []);
          setCalendarHolds(data.holds || []);
          setCalendarSummary(data.summary || null);
        }
      })
      .catch(() => {})
      .finally(() => setCalendarLoading(false));
  }, [calendarMonth.year, calendarMonth.month, form.guests]);

  // Fetch live availability when date + guests are set
  useEffect(() => {
    if (!form.date || !form.guests) {
      setAvailability([]);
      return;
    }
    setAvailabilityLoading(true);
    const params = new URLSearchParams({ date: form.date, guests: form.guests });
    if (form.eventType) params.set('event_type', form.eventType);
    if (form.time) params.set('time_slot', form.time);
    fetch(`/api/mock-pms/availability?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setAvailability(data?.results || []);
      })
      .catch(() => {})
      .finally(() => setAvailabilityLoading(false));
  }, [form.date, form.guests, form.eventType, form.time]);

  const guestCount = useMemo(() => {
    const parsed = Number.parseInt(form.guests, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [form.guests]);

  const fittingAvailability = useMemo(() => {
    return availability.filter((slot) => {
      const capacityMatch = guestCount ? slot.capacity >= guestCount : true;
      const eventTypeMatch = matchesSpaceForEventType(slot, form.eventType);
      return capacityMatch && eventTypeMatch;
    });
  }, [availability, guestCount, form.eventType]);

  // If current selection no longer fits guest count/event type filters, clear it
  useEffect(() => {
    if (!form.selectedSpace) return;
    const selectedStillVisible = fittingAvailability.some(
      (slot) => slot.space_id === form.selectedSpace?.space_id && slot.time_slot_id === form.selectedSpace?.time_slot_id,
    );
    if (!selectedStillVisible) {
      setForm((prev) => ({ ...prev, selectedSpace: null }));
    }
  }, [form.selectedSpace, fittingAvailability]);

  // Click a calendar day to set the form date
  const handleCalendarDayClick = (day: CalendarDay) => {
    if (day.status === 'booked') return;
    update('date', day.date);
    // Also sync calendarMonth if clicking navigated to a different view
  };

  const prevMonth = () => {
    setCalendarMonth((prev) => {
      if (prev.month === 1) return { year: prev.year - 1, month: 12 };
      return { ...prev, month: prev.month - 1 };
    });
  };
  const nextMonth = () => {
    setCalendarMonth((prev) => {
      if (prev.month === 12) return { year: prev.year + 1, month: 1 };
      return { ...prev, month: prev.month + 1 };
    });
  };

  const update = (field: keyof EventFormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Select a space from the availability list
  const selectSpace = (slot: AvailabilityResult) => {
    setForm((prev) => ({
      ...prev,
      selectedSpace: {
        space_id: slot.space_id,
        space_name: slot.space_name,
        space_type: slot.space_type,
        capacity: slot.capacity,
        price: slot.price,
        price_cents: slot.price_cents,
        time_slot_id: slot.time_slot_id,
        time_slot: slot.time_slot,
        amenities: slot.amenities,
      },
      venue: slot.space_type === 'banquet' ? 'banquet' : slot.space_type === 'boardroom' ? 'boardroom' : slot.space_type === 'conference' ? 'conference' : slot.space_type === 'outdoor' ? 'garden' : slot.space_type === 'restaurant' ? 'restaurant' : 'room',
      time: slot.time_slot_id,
    }));
  };

  // Toggle a content item in the selected items list
  const toggleItem = (item: { variation_id: number; title: string; price_cents: number; unit_type: string }) => {
    setForm((prev) => {
      const exists = prev.selectedItems.find((si) => si.variation_id === item.variation_id);
      if (exists) {
        return { ...prev, selectedItems: prev.selectedItems.filter((si) => si.variation_id !== item.variation_id) };
      }
      const guests = parseInt(prev.guests) || 1;
      let defaultQty = 1;
      
      // Calculate quantity based on item type and guest count
      if (item.unit_type === 'person') {
        defaultQty = guests;
      } else {
        // Handle accommodation items (rooms)
        const itemTitle = item.title.toLowerCase();
        if (itemTitle.includes('double room') || itemTitle.includes('double')) {
          // Double room accommodates 2 guests
          defaultQty = Math.ceil(guests / 2);
        } else if (itemTitle.includes('single room') || itemTitle.includes('single')) {
          // Single room accommodates 1 guest
          defaultQty = guests;
        } else if (itemTitle.includes('suite')) {
          // Suite accommodates multiple guests, estimate 4 per suite
          defaultQty = Math.ceil(guests / 4);
        }
      }
      
      return { ...prev, selectedItems: [...prev.selectedItems, { ...item, quantity: defaultQty }] };
    });
  };

  // Update quantity for a selected item
  const updateItemQty = (variation_id: number, qty: number) => {
    setForm((prev) => ({
      ...prev,
      selectedItems: prev.selectedItems.map((si) =>
        si.variation_id === variation_id ? { ...si, quantity: Math.max(1, qty) } : si,
      ),
    }));
  };

  const isValid = form.eventType && form.date && form.guests;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-6 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 mb-3">
            <svg className="h-7 w-7 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{t('quickBooking', language)}</h3>
          <p className="text-sm text-gray-500 mt-1">{t('quickBookingDesc', language)}</p>
        </div>

        {/* Event Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Event Type *</label>
          <div className="grid grid-cols-3 gap-2">
            {EVENT_TYPES.map((et) => (
              <button
                key={et.value}
                type="button"
                onClick={() => update('eventType', et.value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-sm transition-all',
                  form.eventType === et.value
                    ? 'border-gray-900 bg-gray-100 text-gray-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                <span className="text-xl">{et.icon}</span>
                <span className="font-medium text-xs">{et.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Venue */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Venue</label>
          <div className="grid grid-cols-2 gap-2">
            {VENUE_OPTIONS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => update('venue', v.value)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border-2 px-3 py-3 text-left transition-all',
                  form.venue === v.value
                    ? 'border-gray-900 bg-gray-100'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                <span className="text-2xl pt-0.5">{v.icon}</span>
                <div>
                  <p className={cn('text-sm font-medium', form.venue === v.value ? 'text-gray-900' : 'text-gray-700')}>{v.label}</p>
                  <p className="text-xs text-gray-500">{v.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Date, Time, Guests row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => update('date', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Time</label>
            <select
              value={form.time}
              onChange={(e) => update('time', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            >
              <option value="">Select time</option>
              {TIME_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Guests *</label>
            <input
              type="number"
              value={form.guests}
              onChange={(e) => update('guests', e.target.value)}
              placeholder="e.g. 50"
              min="1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>
        </div>

        {/* ─── Availability Calendar (PMS) ─── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">📅 Availability Calendar</label>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Calendar header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-200 transition-colors">
                <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-gray-800">
                {new Date(calendarMonth.year, calendarMonth.month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-gray-200 transition-colors">
                <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>

            {calendarLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" />
              </div>
            ) : (
              <>
                {/* Day labels */}
                <div className="grid grid-cols-7 text-center border-b border-gray-100">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="py-1.5 text-[10px] font-semibold text-gray-400 uppercase">{d}</div>
                  ))}
                </div>
                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-px bg-gray-100 p-px">
                  {/* Leading empty cells */}
                  {calendarDays.length > 0 && Array.from({ length: calendarDays[0].dow }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-white h-9" />
                  ))}
                  {calendarDays.map((day) => {
                    const isSelected = form.date === day.date;
                    const holdOnDay = calendarHolds.find((h) => h.date === day.date);
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => handleCalendarDayClick(day)}
                        disabled={day.status === 'booked'}
                        title={
                          day.status === 'booked'
                            ? 'Fully booked'
                            : day.status === 'limited'
                              ? `Limited availability (${day.available_count}/${day.total_count} slots)`
                              : holdOnDay
                                ? `Held: ${holdOnDay.space_name}`
                                : `Available (${day.available_count}/${day.total_count} slots)`
                        }
                        className={cn(
                          'relative h-9 text-xs font-medium transition-all flex items-center justify-center',
                          isSelected
                            ? 'bg-gray-900 text-white ring-2 ring-gray-300'
                            : day.status === 'available'
                              ? 'bg-white text-gray-800 hover:bg-green-50'
                              : day.status === 'limited'
                                ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                                : 'bg-red-50 text-red-300 cursor-not-allowed',
                        )}
                      >
                        {day.day}
                        {/* Status dot */}
                        <span className={cn(
                          'absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full',
                          isSelected ? 'bg-white' :
                          day.status === 'available' ? 'bg-green-400' :
                          day.status === 'limited' ? 'bg-amber-400' : 'bg-red-400',
                        )} />
                        {holdOnDay && !isSelected && (
                          <span className="absolute top-0 right-0.5 text-[8px]">🔒</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Calendar legend + summary */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-[10px]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400" />Available</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />Limited</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />Booked</span>
                <span className="flex items-center gap-1">🔒 Held</span>
              </div>
              {calendarSummary && (
                <span className="text-gray-500">
                  {calendarSummary.available}✓ {calendarSummary.limited}⚠ {calendarSummary.booked}✕
                  {calendarSummary.active_holds > 0 && ` ${calendarSummary.active_holds}🔒`}
                </span>
              )}
            </div>
          </div>
          {form.guests && (
            <p className="text-xs text-gray-400 mt-1">Showing availability for {form.guests}+ guests. Click a date to select it.</p>
          )}
        </div>

        {/* ─── Live Availability for Selected Date (Selectable) ─── */}
        {form.date && form.guests && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🏨 Select a Space{' '}
              <span className="text-gray-400 font-normal">
                on {new Date(form.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              {form.selectedSpace && <span className="text-green-600 text-xs ml-2">✓ Selected</span>}
            </label>
            {availabilityLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" />
                <span className="ml-2 text-xs text-gray-500">Checking availability...</span>
              </div>
            ) : fittingAvailability.length === 0 ? (
              <div className="rounded-xl border border-dashed border-red-200 bg-red-50 p-4 text-center">
                <p className="text-sm font-medium text-red-700">No spaces available</p>
                <p className="text-xs text-red-500 mt-1">No matching space for event type {form.eventType || 'selected'} with max capacity for {form.guests} guests on this date/time. Try a different date, time, event type, or guest count.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {fittingAvailability.map((slot, i) => {
                  const isSelected = form.selectedSpace?.space_id === slot.space_id && form.selectedSpace?.time_slot_id === slot.time_slot_id;
                  return (
                    <button
                      key={`${slot.space_id}-${slot.time_slot_id}-${i}`}
                      type="button"
                      onClick={() => selectSpace(slot)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-xl border-2 p-3 text-left transition-all',
                        isSelected
                          ? 'border-gray-900 bg-gray-100 ring-1 ring-gray-900/10'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all',
                          isSelected ? 'border-gray-900 bg-gray-900' : 'border-gray-300',
                        )}>
                          {isSelected && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{slot.space_name}</p>
                          <p className="text-xs text-gray-500">{slot.time_slot} · {slot.capacity} max · {slot.amenities.slice(0, 3).join(', ')}</p>
                          {guestCount > 0 && (
                            <p className="text-[11px] text-gray-600">Fits {guestCount} guests · Max {slot.capacity}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-bold text-gray-700">{slot.price}</p>
                        <p className="text-[10px] text-green-600 font-medium">✓ Available</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Setup & Budget row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Setup Style</label>
            <select
              value={form.setupType}
              onChange={(e) => update('setupType', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            >
              <option value="">Select setup</option>
              {SETUP_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Budget (EUR)</label>
            <input
              type="number"
              value={form.budget}
              onChange={(e) => update('budget', e.target.value)}
              placeholder="e.g. 5000"
              min="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>
        </div>

        {/* ─── Add-ons with expandable item selection ─── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Add-ons & Services
            {form.selectedItems.length > 0 && (
              <span className="ml-2 text-xs font-normal text-green-600">
                {form.selectedItems.length} item{form.selectedItems.length !== 1 ? 's' : ''} selected
              </span>
            )}
          </label>
          {contentLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" />
              <span className="ml-2 text-xs text-gray-500">Loading services...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {ADDON_CATEGORIES.map((addon) => {
                const isOpen = form[addon.formKey] as boolean;
                const items = categorizedItems[addon.key];
                const selectedInCategory = form.selectedItems.filter((si) =>
                  items.some((it) => it.variation_id === si.variation_id),
                );
                return (
                  <div key={addon.key} className="rounded-xl border border-gray-200 overflow-hidden transition-all">
                    {/* Toggle header */}
                    <button
                      type="button"
                      onClick={() => update(addon.formKey, !isOpen)}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-3 text-sm transition-all',
                        isOpen ? 'bg-gray-100 border-b border-gray-200' : 'bg-white hover:bg-gray-50',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{addon.icon}</span>
                        <span className="font-medium text-gray-800">{addon.label}</span>
                        {selectedInCategory.length > 0 && (
                          <span className="ml-1 inline-flex items-center rounded-full bg-gray-900 text-white text-[10px] font-bold px-1.5 py-0.5">
                            {selectedInCategory.length}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {items.length > 0 && (
                          <span className="text-xs text-gray-400">{items.length} option{items.length !== 1 ? 's' : ''}</span>
                        )}
                        <svg className={cn('h-4 w-4 text-gray-400 transition-transform', isOpen && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded items */}
                    {isOpen && (
                      <div className="bg-white">
                        {items.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-gray-400 italic">No items available in this category</div>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {items.map((item) => {
                              const sel = form.selectedItems.find((si) => si.variation_id === item.variation_id);
                              const isChecked = !!sel;
                              const priceDisplay = item.price_cents > 0
                                ? `€${(item.price_cents / 100).toLocaleString('en-IE', { minimumFractionDigits: 0 })}/${item.unit_type}`
                                : '';
                              return (
                                <div key={item.variation_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                                  {/* Checkbox */}
                                  <button
                                    type="button"
                                    onClick={() => toggleItem(item)}
                                    className={cn(
                                      'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-all',
                                      isChecked ? 'border-gray-900 bg-gray-900' : 'border-gray-300 hover:border-gray-400',
                                    )}
                                  >
                                    {isChecked && (
                                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                      </svg>
                                    )}
                                  </button>

                                  {/* Item info */}
                                  <button type="button" onClick={() => toggleItem(item)} className="flex-1 text-left min-w-0">
                                    <p className={cn('text-sm', isChecked ? 'font-medium text-gray-900' : 'text-gray-700')}>{item.title}</p>
                                  </button>

                                  {/* Price */}
                                  {priceDisplay && (
                                    <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">{priceDisplay}</span>
                                  )}

                                  {/* Quantity */}
                                  {isChecked && (
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => updateItemQty(item.variation_id, (sel?.quantity ?? 1) - 1)}
                                        className="h-6 w-6 flex items-center justify-center rounded border border-gray-300 text-gray-500 hover:bg-gray-100 text-xs"
                                      >−</button>
                                      <input
                                        type="number"
                                        min={1}
                                        value={sel?.quantity ?? 1}
                                        onChange={(e) => updateItemQty(item.variation_id, parseInt(e.target.value) || 1)}
                                        className="w-10 text-center text-xs border border-gray-300 rounded py-1 focus:outline-none focus:ring-1 focus:ring-gray-700"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => updateItemQty(item.variation_id, (sel?.quantity ?? 1) + 1)}
                                        className="h-6 w-6 flex items-center justify-center rounded border border-gray-300 text-gray-500 hover:bg-gray-100 text-xs"
                                      >+</button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected items summary */}
          {form.selectedItems.length > 0 && (
            <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Selected Items Summary</p>
              <div className="space-y-1">
                {form.selectedItems.map((si) => (
                  <div key={si.variation_id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{si.title} × {si.quantity}</span>
                    {si.price_cents > 0 && (
                      <span className="font-medium text-gray-800">
                        €{((si.price_cents * si.quantity) / 100).toLocaleString('en-IE', { minimumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-1 mt-1 flex items-center justify-between text-xs font-semibold text-gray-900">
                  <span>Estimated Add-ons Total</span>
                  <span>
                    €{form.selectedItems.reduce((sum, si) => sum + (si.price_cents * si.quantity) / 100, 0).toLocaleString('en-IE', { minimumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Additional Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={2}
            placeholder="Any special requirements or preferences..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700 resize-none"
          />
        </div>

        {/* Submit */}
        <button
          onClick={() => isValid && onSubmit(form)}
          disabled={!isValid || isLoading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          Generate Proposal with AI
        </button>

        <p className="text-center text-xs text-gray-400 pb-4">
          Fields marked with * are required. The AI will fill in pricing and create a detailed proposal.
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function EmptyState({
  suggestions,
  onSelect,
  isSales,
  language,
}: {
  suggestions: string[];
  onSelect: (s: string) => void;
  isSales: boolean;
  language: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      {/* Animated icon */}
      <div className="relative mb-6">
        <div className="absolute -inset-3 rounded-full bg-gray-200/50 blur-xl animate-pulse" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-700 to-gray-900 shadow-lg shadow-gray-900/20">
          <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-1">{isSales ? t('salesEmptyTitle', language) : t('guestEmptyTitle', language)}</h3>
      <p className="text-sm text-gray-500 max-w-md mb-8">
        {isSales
          ? t('salesEmptyDesc', language)
          : t('guestEmptyDesc', language)}
      </p>
      {isSales && (
        <p className="mb-5 text-xs font-medium text-gray-600">
          {t('salesDraftEmptyNote', language)}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl w-full">
        {suggestions.map((s, i) => (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className="chat-suggestion text-left rounded-xl border border-gray-200/80 bg-white p-3.5 text-sm text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 hover:shadow-md hover:shadow-gray-900/5 hover:-translate-y-0.5 active:translate-y-0"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="line-clamp-2">{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InputCard({
  request,
  disabled,
  onSubmit,
}: {
  request: UserInputRequest;
  disabled: boolean;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const requestResetKey = useMemo(() => JSON.stringify({
    title: request.title,
    description: request.description ?? '',
    fields: request.fields.map((field) => ({
      name: field.name,
      type: field.type,
      required: !!field.required,
      defaultValue: field.default_value ?? '',
      options: (field.options ?? []).map((option) => ({ value: option.value, label: option.label })),
    })),
  }), [request.description, request.fields, request.title]);

  const initialValues = useMemo(() => {
    const values: Record<string, string> = {};
    for (const field of request.fields) {
      if (field.default_value) {
        values[field.name] = field.default_value;
      } else if (field.type === 'toggle_group' && field.options?.[0]?.value) {
        values[field.name] = field.options[0].value;
      } else {
        values[field.name] = '';
      }
    }
    return values;
  }, [requestResetKey, request.fields]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [requestResetKey, initialValues]);

  const missingRequired = request.fields.some((field) => field.required && !values[field.name]?.trim());

  return (
    <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-gray-900 px-4 py-3">
        <h4 className="text-sm font-semibold text-white">{request.title}</h4>
        {request.description && <p className="text-xs text-gray-200 mt-0.5">{request.description}</p>}
      </div>
      <div className="p-4 space-y-3">
        {request.fields.map((field) => (
          <div key={field.name} className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-700">
              {field.label}{field.required ? ' *' : ''}
            </label>

            {field.type === 'select' && (
              <select
                value={values[field.name] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                disabled={disabled}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-60"
              >
                <option value="">{field.placeholder || `Select ${field.label.toLowerCase()}`}</option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>{toDisplayText(option.label)}</option>
                ))}
              </select>
            )}

            {field.type === 'date' && (
              <input
                type="date"
                value={values[field.name] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                disabled={disabled}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-60"
              />
            )}

            {field.type === 'number' && (
              <input
                type="number"
                value={values[field.name] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                min={field.min}
                max={field.max}
                placeholder={field.placeholder}
                disabled={disabled}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-60"
              />
            )}

            {field.type === 'text' && (
              <input
                type="text"
                value={values[field.name] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                placeholder={field.placeholder}
                disabled={disabled}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-60"
              />
            )}

            {field.type === 'toggle_group' && (
              <div className="grid grid-cols-2 gap-2">
                {(field.options ?? []).map((option) => {
                  const active = values[field.name] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setValues((prev) => ({ ...prev, [field.name]: option.value }))}
                      disabled={disabled}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                        active
                          ? 'border-gray-900 bg-gray-100 text-gray-900'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                      )}
                    >
                      {option.icon && <span>{option.icon}</span>}
                      <span className="font-medium">{toDisplayText(option.label)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          disabled={disabled || missingRequired}
          onClick={() => onSubmit(values)}
          className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  onAccept,
  onReject,
  onNegotiate,
  onSendStructuredInput,
  acceptedDraftKeys,
  isLoading,
}: {
  message: UIMessage;
  onAccept: (esignUrl?: string | null) => void;
  onReject: () => void;
  onNegotiate: (draft: ProposalDraft) => void;
  onSendStructuredInput: (textPayload: string) => void;
  acceptedDraftKeys: Set<string>;
  isLoading: boolean;
}) {
  const rawText = getMessageText(message);
  const { content: text, quickReplies } = extractQuickReplies(rawText);

  // Extract tool parts — handle both flat DynamicToolUIPart and nested ToolInvocation formats
  const toolParts: ToolPart[] = [];
  const messageParts = Array.isArray((message as { parts?: unknown }).parts)
    ? ((message as { parts: unknown[] }).parts)
    : [];

  for (const p of messageParts) {
    if (!p || typeof p !== 'object') continue;
    const part = p as {
      type?: unknown;
      toolInvocation?: unknown;
      toolName?: unknown;
      toolCallId?: unknown;
      state?: unknown;
      output?: unknown;
      input?: unknown;
    };

    if (part.type === 'dynamic-tool') {
      // Flat structure: { type, toolName, toolCallId, state, output }
      const p = part as unknown as ToolPart;
      toolParts.push({ ...p, state: p.state === 'result' ? 'output-available' : p.state });
    } else if (part.type === 'tool-invocation' && 'toolInvocation' in part) {
      // Nested structure from useChat: { type: 'tool-invocation', toolInvocation: { toolName, state: 'result', result } }
      // ⚠️ Must come BEFORE the startsWith('tool-') check below — 'tool-invocation' also starts with 'tool-'
      const inv = (part as any).toolInvocation;
      toolParts.push({
        type: 'tool-invocation',
        toolName: inv.toolName ?? '',
        toolCallId: inv.toolCallId ?? '',
        state: inv.state === 'result' ? 'output-available' : (inv.state ?? 'call'),
        input: inv.args,
        output: inv.result,
      });
    } else if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
      // Flat tool parts from saved messages: { type: 'tool-invocation', toolName, state: 'result', output }
      // Map 'result' → 'output-available' so the Thinking indicator hides correctly
      const p = part as unknown as ToolPart;
      toolParts.push({ ...p, state: p.state === 'result' ? 'output-available' : p.state });
    }
  }

  // Hide action messages — show a pill label instead
  if (message.role === 'user' && text.startsWith('[ACTION:')) {
    const label =
      text === '[ACTION:ACCEPT_PROPOSAL]'
        ? 'Accepted the proposal'
        : text === '[ACTION:REJECT_PROPOSAL]'
          ? 'Rejected the proposal'
          : text.startsWith('[ACTION:NEGOTIATE]')
            ? 'Requested negotiation'
            : 'Requested negotiation';
    return (
      <div className="flex justify-end">
        <div className="rounded-full bg-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
          {label}
        </div>
      </div>
    );
  }

  // Extract proposal drafts, charts, booking confirmations, and rich tool results
  const proposalDrafts: ProposalDraft[] = [];
  const charts: ChartConfig[] = [];
  const bookingConfirmations: { url: string; title: string; emailSent?: boolean; readyForSignature?: boolean }[] = [];
  const availabilityResults: AvailabilityResult[] = [];
  const searchResults: SearchResultSet[] = [];
  const pricingResults: PricingResult[] = [];
  const calendarResults: CalendarResult[] = [];
  const floorPlanResults: FloorPlanResult[] = [];
  const inputRequests: UserInputRequest[] = [];
  const imageResults: ImageResult[] = [];
  for (const part of toolParts) {
    if (part.state === 'output-available' && part.output && typeof part.output === 'object') {
      const result = part.output as Record<string, unknown>;
      if (result.type === 'proposal_draft') {
        proposalDrafts.push(result as unknown as ProposalDraft);
      } else if (result.type === 'chart') {
        charts.push(result as unknown as ChartConfig);
      } else if ((result.type === 'booking_confirmed' || result.type === 'esign_redirect') && result.esign && typeof result.esign === 'object') {
        const esign = result.esign as { url?: string };
        const booking = result.booking as { title?: string } | undefined;
        if (esign.url) {
          bookingConfirmations.push({
            url: esign.url,
            title: booking?.title || 'Your Proposal',
            emailSent: !!result.emailSent,
            readyForSignature: result.type === 'esign_redirect',
          });
        }
      } else if (result.type === 'availability' && Array.isArray(result.options)) {
        availabilityResults.push(result as unknown as AvailabilityResult);
      } else if (result.type === 'pricing_calculation' || result.type === 'pricing') {
        pricingResults.push(result as unknown as PricingResult);
      } else if (result.type === 'availability_calendar') {
        calendarResults.push(result as unknown as CalendarResult);
      } else if (result.type === 'floor_plan') {
        floorPlanResults.push(result as unknown as FloorPlanResult);
      } else if (result.type === 'user_input_request' && Array.isArray(result.fields)) {
        inputRequests.push(result as unknown as UserInputRequest);
      } else if (result.type === 'image_result' && result.success) {
        imageResults.push(result as unknown as ImageResult);
      }
      // Search results from searchProposals tool
      if (part.toolName === 'searchProposals' && Array.isArray(result.results)) {
        searchResults.push({ type: 'proposals', items: result.results as SearchItem[], total: (result.total as number) || 0 });
      }
    }
  }

  return (
    <div
      className={cn(
        'flex gap-3',
        message.role === 'user' ? 'justify-end' : 'justify-start',
      )}
    >
      {message.role === 'assistant' && (
        <div className="flex-shrink-0 mt-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900 shadow-sm">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
        </div>
      )}

      <div className={cn('max-w-[80%] space-y-3')}>
        {/* Proposal Draft Cards */}
        {proposalDrafts.map((draft, i) => (
          <ProposalCard
            key={i}
            draft={draft}
            onAccept={onAccept}
            onReject={onReject}
            isAccepted={acceptedDraftKeys.has(getDraftAcceptanceKey(draft))}
            isLoading={isLoading}
          />
        ))}

        {/* Proposal Comparison — shown when multiple rounds in conversation */}
        {proposalDrafts.length >= 2 && (
          <ProposalComparisonCard drafts={proposalDrafts} />
        )}

        {/* Chart Cards */}
        {charts.map((chart, i) => (
          <ChartCard key={`chart-${i}`} config={chart} />
        ))}

        {/* Availability / Venue Cards */}
        {availabilityResults.map((avail, i) => (
          <AvailabilityCard key={`avail-${i}`} data={avail} />
        ))}

        {/* Pricing Result Cards */}
        {pricingResults.map((pricing, i) => (
          <PricingCard key={`pricing-${i}`} data={pricing} />
        ))}

        {/* Search Result Cards */}
        {searchResults.map((sr, i) => (
          <SearchResultsCard key={`search-${i}`} data={sr} />
        ))}

        {/* Availability Calendar Cards */}
        {calendarResults.map((cal, i) => (
          <AvailabilityCalendarCard
            key={`cal-${i}`}
            data={cal}
            onSelectDate={(date) => {
              onSendStructuredInput(`Please check venue options for ${date}.`);
            }}
          />
        ))}

        {/* Floor Plan Cards */}
        {floorPlanResults.map((fp, i) => (
          <FloorPlanCard key={`fp-${i}`} data={fp} />
        ))}

        {/* AI Generated Images */}
        {imageResults.map((img, i) => (
          <ImageCard key={`img-${i}`} data={img} />
        ))}

        {/* Structured Input Cards */}
        {inputRequests.map((request, i) => (
          <InputCard
            key={`input-request-${i}`}
            request={request}
            disabled={isLoading}
            onSubmit={(values) => {
              const pairs = request.fields
                .map((field) => {
                  const value = values[field.name];
                  return value ? `${field.label}: ${value}` : null;
                })
                .filter((pair): pair is string => !!pair);

              if (pairs.length === 0) return;

              const payload = `Here are the requested details:\n${pairs.map((p) => `- ${p}`).join('\n')}`;
              onSendStructuredInput(payload);
            }}
          />
        ))}

        {/* E-Sign Cards with QR Code */}
        {bookingConfirmations.map((conf, i) => (
          <div key={`esign-${i}`} className="w-full max-w-lg rounded-xl border border-green-200 bg-green-50 shadow-sm overflow-hidden venue-card-enter">
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-green-800">
                  {conf.readyForSignature ? 'Review & Sign Proposal' : 'Proposal Accepted'}
                </h4>
                <p className="text-xs text-green-600 mt-0.5">{conf.title}</p>
              </div>
            </div>
            {conf.emailSent && (
              <div className="px-5 pb-2 flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                <span className="text-xs font-medium text-green-700">E-sign link sent to your email</span>
              </div>
            )}
            {/* QR Code */}
            <div className="px-5 py-3 flex items-center gap-4 border-t border-green-100">
              <div className="rounded-lg bg-white p-2 shadow-sm">
                <QRCodeSVG value={conf.url} size={80} level="M" />
              </div>
              <div>
                <p className="text-xs font-semibold text-green-800">Scan to E-Sign</p>
                <p className="text-[0.65rem] text-green-600 mt-0.5">Open on your phone to review and sign the proposal instantly</p>
              </div>
            </div>
            <div className="border-t border-green-200 px-5 py-3">
              <a
                href={conf.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                View &amp; E-Sign Proposal
              </a>
            </div>
          </div>
        ))}

        {/* Text content */}
        {text && (
          <div
            className={cn(
              'rounded-2xl px-4 py-3 text-sm',
              message.role === 'user'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-white border border-gray-200/80 text-gray-800 shadow-sm',
            )}
          >
            {message.role === 'assistant' ? (
              <div
                className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-gray-700 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(text) }}
              />
            ) : (
              <p className="whitespace-pre-wrap">{text}</p>
            )}
          </div>
        )}

        {message.role === 'assistant' && quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quickReplies.map((reply, index) => (
              <button
                key={`${reply.label}-${index}`}
                type="button"
                onClick={() => onSendStructuredInput(reply.message)}
                disabled={isLoading}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reply.label}
              </button>
            ))}
          </div>
        )}

        {/* Tool invocation indicators — show clean thinking/generating state */}
        {(() => {
          const pendingTools = toolParts.filter(
            (t) => !(t.state === 'output-available' &&
                t.output &&
                typeof t.output === 'object' &&
                (((t.output as Record<string, unknown>).type === 'proposal_draft') ||
                 ((t.output as Record<string, unknown>).type === 'chart') ||
                 ((t.output as Record<string, unknown>).type === 'booking_confirmed') ||
                 ((t.output as Record<string, unknown>).type === 'image_result'))),
          );
          if (pendingTools.length === 0) return null;

          const hasRunning = pendingTools.some((t) => t.state !== 'output-available');
          const allDone = pendingTools.every((t) => t.state === 'output-available');

          if (allDone) return null; // hide once all tools are done and text is streamed

          // Determine a user-friendly label based on running tools
          const runningTool = pendingTools.find((t) => t.state !== 'output-available');
          const label = runningTool
            ? getThinkingLabel(runningTool.toolName)
            : 'Generating response...';

          return (
            <div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          );
        })()}
      </div>

      {message.role === 'user' && (
        <div className="flex-shrink-0 mt-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-200 shadow-sm">
            <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  draft,
  onAccept,
  onReject,
  isAccepted,
  isLoading,
}: {
  draft: ProposalDraft;
  onAccept: (esignUrl?: string | null) => void;
  onReject: () => void;
  isAccepted: boolean;
  isLoading: boolean;
}) {
  const [actionTaken, setActionTaken] = useState<'rejected' | null>(null);
  const buttonsDisabled = actionTaken === 'rejected' || isLoading || isAccepted;

  const hasPrices = draft.items.some((i) => i.unit_price != null && !isNaN(i.unit_price));
  const fmt = (n: number) =>
    n == null || isNaN(n)
      ? '—'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: draft.currency || 'EUR',
        }).format(n);

  const venueImage = getVenueImage(draft.venue_type);
  const rawHeaderUrl = draft.header_image || venueImage?.url;
  const headerUrl = rawHeaderUrl ? rawHeaderUrl.replace(/ /g, '%20') : null;
  const headerLabel = venueImage?.label || (draft.header_image ? 'Content Preview' : null);

  return (
    <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header Image — content image preferred, venue fallback */}
      {headerUrl && (
        <div className="relative h-36 w-full overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${headerUrl})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          {headerLabel && (
            <div className="absolute bottom-3 left-4 flex items-center gap-2">
              <span className="rounded-full bg-white/20 backdrop-blur-sm px-2.5 py-0.5 text-xs font-medium text-white">
                {headerLabel}
              </span>
            </div>
          )}
        </div>
      )}
      {/* Header */}
      <div className="bg-gray-900 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <h3 className="text-base font-semibold text-white">Proposal Draft</h3>
            </div>
            <p className="mt-1 text-sm text-white/80">{draft.title}</p>
          </div>
          {draft.discount_applied > 0 && (
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
              {draft.discount_applied}% OFF
            </span>
          )}
        </div>
        {draft.is_final_offer && (
          <div className="mt-2 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90">
            🌟 This is our best and final offer
          </div>
        )}
      </div>

      {/* Recipient */}
      <div className="border-b border-gray-100 px-5 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Recipient</p>
        <p className="text-sm font-medium text-gray-800">{draft.recipient.name}</p>
        <p className="text-xs text-gray-500">{draft.recipient.email}</p>
        {draft.recipient.company && (
          <p className="text-xs text-gray-500">{draft.recipient.company}</p>
        )}
      </div>

      {/* Line Items with slide-in animation */}
      <div className="px-5 py-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Item</th>
              <th className="pb-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400">Qty</th>
              {hasPrices && (
                <>
                  <th className="pb-2 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Price</th>
                  <th className="pb-2 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Total</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item, i) => (
              <tr key={i} className="border-b border-gray-50 cost-line-item" style={{ animationDelay: `${i * 120}ms` }}>
                <td className="py-2.5">
                  <div className="flex items-center gap-3">
                    {item.image_url && (
                      <img src={item.image_url} alt={item.name} className="h-10 w-10 rounded-md object-cover flex-shrink-0" />
                    )}
                    <div>
                      <p className="font-medium text-gray-800">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.description}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 text-center text-gray-600">{item.quantity}</td>
                {hasPrices && (
                  <>
                    <td className="py-2.5 text-right text-gray-600">{fmt(item.unit_price)}</td>
                    <td className="py-2.5 text-right font-medium text-gray-800">{fmt(item.total)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals with count-up animation */}
      {hasPrices ? (
        <div className="border-t border-gray-200 bg-gray-50 px-5 py-3 space-y-1 cost-total-reveal" style={{ animationDelay: `${draft.items.length * 120 + 200}ms` }}>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>{fmt(draft.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Tax (est.)</span>
            <span>{fmt(draft.tax)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-200">
            <span>Total</span>
            <span>{fmt(draft.total)}</span>
          </div>
          {draft.negotiation_round > 0 && (
            <p className="text-xs text-green-600 font-medium">
              ✨ Special offer — {draft.discount_applied}% discount applied
            </p>
          )}
        </div>
      ) : (
        <div className="border-t border-gray-200 bg-gray-50 px-5 py-3 cost-total-reveal" style={{ animationDelay: `${draft.items.length * 120 + 200}ms` }}>
          <p className="text-xs text-gray-500 text-center">Pricing will be confirmed once the proposal is generated</p>
        </div>
      )}

      {/* Notes */}
      {draft.notes && (
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="text-xs text-gray-500">{draft.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-gray-200 px-5 py-4 flex gap-3">
        {isAccepted ? (
          <div className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-100 px-4 py-2.5 text-sm font-semibold text-green-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Accepted
          </div>
        ) : actionTaken === 'rejected' ? (
          <div className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-100 px-4 py-2.5 text-sm font-semibold text-red-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            {draft.is_final_offer ? 'Declined' : 'Rejected'}
          </div>
        ) : (
          <>
            <button
              onClick={() => { onAccept(draft.proposalUrl ?? null); }}
              disabled={buttonsDisabled}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {isLoading ? 'Generating Proposal...' : 'Accept & Generate Proposal'}
            </button>
            <button
              onClick={() => { setActionTaken('rejected'); onReject(); }}
              disabled={buttonsDisabled}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 chat-msg-enter">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900 shadow-sm">
        <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>
      <div className="rounded-2xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm">
        <div className="flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Rich Tool Result Cards ───

const SPACE_IMAGES: Record<string, string> = {
  'Grand Ballroom': '/images/Banquet%20Grand.webp',
  'Executive Boardroom': '/images/Boardroom%20Grand.jpg',
  'Rooftop Garden': '/images/decoration.jpeg',
  'Conference Hall A': '/images/microphone%20and%20speakers.webp',
  'The Grand Restaurant': '/images/Dinner.jpg',
};

function AvailabilityCard({ data }: { data: AvailabilityResult }) {
  return (
    <div className="w-full max-w-lg venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Available Spaces</h4>
            <p className="text-xs text-gray-500">
              {data.query.date} · {data.query.guests} guests · {data.query.event_type}
            </p>
          </div>
          <span className="ml-auto rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
            {data.options.length} found
          </span>
        </div>
        {/* Options */}
        <div className="p-3 space-y-2">
          {data.options.slice(0, 5).map((opt, i) => {
            const img = SPACE_IMAGES[opt.space_name];
            return (
              <div
                key={i}
                className="venue-card-enter flex gap-3 rounded-lg border border-gray-100 bg-white p-3 hover:border-gray-300 hover:shadow-sm transition-all duration-200"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {img && (
                  <div className="flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden">
                    <img src={img} alt={opt.space_name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{opt.space_name}</p>
                      <p className="text-xs text-gray-500 capitalize">{opt.time_slot} · Up to {opt.capacity} pax</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-sm font-bold text-gray-700">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: opt.currency || 'SEK', maximumFractionDigits: 0 }).format(opt.total_price)}
                      </p>
                      {opt.base_price !== opt.total_price && (
                        <p className="text-[0.65rem] text-gray-400 line-through">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: opt.currency || 'SEK', maximumFractionDigits: 0 }).format(opt.base_price)}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Capacity bar */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-1 rounded-full bg-gray-400 transition-all"
                        style={{ width: `${Math.min(opt.utilization * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[0.6rem] text-gray-400">{Math.round(opt.utilization * 100)}% util</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PricingCard({ data }: { data: PricingResult }) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: data.currency || 'SEK',
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="w-full max-w-md venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden tool-result-shimmer">
        <div className="bg-gray-900 px-5 py-3">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
            <h4 className="text-sm font-semibold text-white">{data.space_name}</h4>
          </div>
        </div>
        <div className="px-5 py-3 space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Base Price</span>
            <span>{fmt(data.base_price)}</span>
          </div>
          {data.breakdown?.map((b, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-gray-500 capitalize">{b.factor.replace(/_/g, ' ')}</span>
              <span className={cn('font-medium', b.multiplier > 1 ? 'text-warning-600' : 'text-success-600')}>
                ×{b.multiplier.toFixed(2)}
              </span>
            </div>
          ))}
          <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Total</span>
            <span className="text-lg font-bold text-gray-900">{fmt(data.total_price)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchResultsCard({ data }: { data: SearchResultSet }) {
  const STATUS_COLORS: Record<string, string> = {
    accepted: 'bg-green-100 text-green-700',
    active: 'bg-gray-100 text-gray-700',
    draft: 'bg-gray-100 text-gray-600',
    expired: 'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-700',
    sent: 'bg-blue-100 text-blue-700',
  };

  if (data.items.length === 0) return null;

  return (
    <div className="w-full max-w-lg venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <h4 className="text-sm font-semibold text-gray-700">Proposals Found</h4>
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            {data.total}
          </span>
        </div>
        <div className="divide-y divide-gray-50">
          {data.items.slice(0, 5).map((item, i) => (
            <div
              key={item.uuid || i}
              className="px-5 py-2.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.title_md || item.title || 'Untitled'}
                </p>
                <p className="text-xs text-gray-400">
                  {item.contact_name || item.recipient_name || 'No contact'}
                </p>
              </div>
              {item.status && (
                <span className={cn('rounded-full px-2 py-0.5 text-[0.65rem] font-medium capitalize', STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-600')}>
                  {item.status}
                </span>
              )}
              {item.value_with_tax != null && (
                <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
                  {new Intl.NumberFormat('en-IE', { style: 'currency', currency: item.currency || 'EUR', maximumFractionDigits: 0 }).format(item.value_with_tax)}
                </span>
              )}
            </div>
          ))}
          {data.items.length > 5 && (
            <div className="px-5 py-2 text-center">
              <span className="text-xs text-gray-400">+{data.items.length - 5} more</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Availability Calendar Card ───

const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function AvailabilityCalendarCard({ data, onSelectDate }: { data: CalendarResult; onSelectDate?: (date: string) => void }) {
  const firstDow = data.days[0]?.dow ?? 0;
  const blanks = Array.from({ length: firstDow }, (_, i) => i);

  return (
    <div className="w-full max-w-md venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <h4 className="text-sm font-semibold text-white">{data.month_name} {data.year}</h4>
          </div>
          <span className="text-xs text-white/70">{data.space_name}</span>
        </div>

        {/* Legend */}
        <div className="px-5 py-2 flex items-center gap-4 border-b border-gray-100 text-[0.65rem]">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-green-400" /> Available ({data.summary.available})</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Limited ({data.summary.limited})</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-300" /> Booked ({data.summary.booked})</span>
        </div>

        {/* Calendar Grid */}
        <div className="p-4">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW_LABELS.map((d) => (
              <div key={d} className="text-center text-[0.6rem] font-semibold text-gray-400 uppercase">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {blanks.map((b) => (
              <div key={`blank-${b}`} />
            ))}
            {data.days.map((day, i) => {
              const bg = day.status === 'available' ? 'bg-green-100 text-green-800 hover:bg-green-200'
                : day.status === 'limited' ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                : 'bg-red-100 text-red-400';
              const isSelectable = !!onSelectDate && day.status !== 'booked';
              return (
                <div
                  key={day.date}
                  className={cn(
                    'cal-day-enter flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors',
                    bg,
                    isSelectable ? 'cursor-pointer ring-1 ring-transparent hover:ring-gray-300' : 'cursor-default',
                  )}
                  style={{ animationDelay: `${i * 15}ms` }}
                  title={`${day.date}: ${day.slots_available}/${day.slots_total} slots available`}
                  onClick={() => {
                    if (isSelectable && onSelectDate) onSelectDate(day.date);
                  }}
                >
                  {day.day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI Image Card ───

function ImageCard({ data }: { data: ImageResult }) {
  if (!data.success || !data.image) return null;
  const src = `data:${data.image.mimeType};base64,${data.image.base64}`;
  return (
    <div className="w-full max-w-lg venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="relative">
          <img
            src={src}
            alt={data.image.label}
            className="w-full object-cover"
            style={{ maxHeight: '24rem' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
          <div className="absolute bottom-3 left-4 flex items-center gap-2">
            <span className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-xs font-medium text-white">
              {data.image.label}
            </span>
            <span className="rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-[10px] text-white/80">
              AI Generated
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Floor Plan Card ───

function FloorPlanCard({ data }: { data: FloorPlanResult }) {
  return (
    <div className="w-full max-w-md venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-3">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <h4 className="text-sm font-semibold text-white">Floor Plan — {data.layout.charAt(0).toUpperCase() + data.layout.slice(1)}</h4>
          </div>
          <p className="text-xs text-white/70 mt-0.5">{data.space_name}</p>
        </div>

        {/* SVG Floor Plan */}
        <div className="p-4 flex justify-center">
          <FloorPlanSVG layout={data.layout} guests={data.guests} />
        </div>

        {/* Info */}
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-sm text-gray-700">{data.recommendation}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              data.fits ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
            )}>
              {data.fits ? `Fits ${data.guests} guests` : 'Exceeds capacity'}
            </span>
            <span className="text-xs text-gray-400">Max: {data.max_capacity_for_layout} pax</span>
          </div>
        </div>

        {/* Layout Options */}
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider mb-2">Alternative Layouts</p>
          <div className="flex flex-wrap gap-1.5">
            {data.layouts_available.map((l) => (
              <span
                key={l.layout}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors',
                  l.layout === data.layout ? 'border-gray-900 bg-gray-100 text-gray-900' :
                  l.fits_guests ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-gray-100 bg-gray-50 text-gray-400',
                )}
              >
                {l.layout.charAt(0).toUpperCase() + l.layout.slice(1)} ({l.max_capacity})
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FloorPlanSVG({ layout, guests }: { layout: string; guests: number }) {
  const w = 280;
  const h = 180;

  const renderLayout = () => {
    switch (layout) {
      case 'theater': {
        const rows = Math.min(Math.ceil(guests / 8), 6);
        const seatsPerRow = Math.ceil(guests / rows);
        return (
          <>
            {/* Stage */}
            <rect x={w / 2 - 50} y={10} width={100} height={20} rx={4} fill="#171717" opacity={0.3} />
            <text x={w / 2} y={24} textAnchor="middle" fontSize={8} fill="#171717" fontWeight={600}>STAGE</text>
            {/* Seats */}
            {Array.from({ length: rows }).map((_, row) =>
              Array.from({ length: seatsPerRow }).map((_, col) => {
                const seatNum = row * seatsPerRow + col;
                if (seatNum >= guests) return null;
                const cx = (w - seatsPerRow * 22) / 2 + col * 22 + 11;
                const cy = 50 + row * 22;
                return <circle key={seatNum} cx={cx} cy={cy} r={7} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${seatNum * 20}ms` }} />;
              }),
            )}
          </>
        );
      }
      case 'classroom': {
        const rows = Math.min(Math.ceil(guests / 6), 5);
        const desksPerRow = Math.ceil(guests / rows / 2);
        return (
          <>
            <rect x={w / 2 - 40} y={8} width={80} height={16} rx={3} fill="#171717" opacity={0.3} />
            <text x={w / 2} y={20} textAnchor="middle" fontSize={7} fill="#171717" fontWeight={600}>PRESENTER</text>
            {Array.from({ length: rows }).map((_, row) => (
              <g key={row}>
                {Array.from({ length: desksPerRow }).map((_, col) => {
                  const x = (w - desksPerRow * 55) / 2 + col * 55;
                  const y = 40 + row * 30;
                  return (
                    <g key={col} className="floor-plan-seat" style={{ animationDelay: `${(row * desksPerRow + col) * 30}ms` }}>
                      <rect x={x} y={y} width={45} height={12} rx={2} fill="#e5e5e5" stroke="#171717" strokeWidth={0.5} />
                      <circle cx={x + 15} cy={y + 20} r={5} fill="#171717" opacity={0.6} />
                      <circle cx={x + 30} cy={y + 20} r={5} fill="#171717" opacity={0.6} />
                    </g>
                  );
                })}
              </g>
            ))}
          </>
        );
      }
      case 'banquet': {
        const tables = Math.ceil(guests / 8);
        const cols = Math.min(tables, 3);
        const rows = Math.ceil(tables / cols);
        return (
          <>
            {Array.from({ length: tables }).map((_, i) => {
              const row = Math.floor(i / cols);
              const col = i % cols;
              const cx = (w - cols * 80) / 2 + col * 80 + 40;
              const cy = 30 + row * 70 + 35;
              return (
                <g key={i} className="floor-plan-seat" style={{ animationDelay: `${i * 60}ms` }}>
                  <circle cx={cx} cy={cy} r={22} fill="#e5e5e5" stroke="#171717" strokeWidth={1} />
                  {Array.from({ length: 8 }).map((_, s) => {
                    const angle = (s / 8) * Math.PI * 2 - Math.PI / 2;
                    const sx = cx + Math.cos(angle) * 30;
                    const sy = cy + Math.sin(angle) * 30;
                    return <circle key={s} cx={sx} cy={sy} r={4} fill="#171717" opacity={0.6} />;
                  })}
                </g>
              );
            })}
          </>
        );
      }
      case 'u-shape': {
        const sideSeats = Math.floor(guests / 3);
        const bottomSeats = guests - sideSeats * 2;
        return (
          <>
            {/* U-shape table */}
            <rect x={40} y={30} width={12} height={120} rx={3} fill="#e5e5e5" stroke="#171717" strokeWidth={1} />
            <rect x={w - 52} y={30} width={12} height={120} rx={3} fill="#e5e5e5" stroke="#171717" strokeWidth={1} />
            <rect x={40} y={138} width={w - 80} height={12} rx={3} fill="#e5e5e5" stroke="#171717" strokeWidth={1} />
            {/* Left seats */}
            {Array.from({ length: sideSeats }).map((_, i) => (
              <circle key={`l-${i}`} cx={25} cy={40 + i * (110 / sideSeats)} r={5} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${i * 30}ms` }} />
            ))}
            {/* Right seats */}
            {Array.from({ length: sideSeats }).map((_, i) => (
              <circle key={`r-${i}`} cx={w - 25} cy={40 + i * (110 / sideSeats)} r={5} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${(sideSeats + i) * 30}ms` }} />
            ))}
            {/* Bottom seats */}
            {Array.from({ length: bottomSeats }).map((_, i) => (
              <circle key={`b-${i}`} cx={60 + i * ((w - 120) / Math.max(bottomSeats - 1, 1))} cy={162} r={5} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${(sideSeats * 2 + i) * 30}ms` }} />
            ))}
            <text x={w / 2} y={20} textAnchor="middle" fontSize={7} fill="#171717" fontWeight={600}>OPEN END</text>
          </>
        );
      }
      case 'boardroom': {
        const halfGuests = Math.ceil(guests / 2);
        return (
          <>
            <rect x={w / 2 - 60} y={h / 2 - 20} width={120} height={40} rx={8} fill="#e5e5e5" stroke="#171717" strokeWidth={1} />
            {Array.from({ length: halfGuests }).map((_, i) => (
              <circle key={`t-${i}`} cx={w / 2 - 50 + i * (100 / Math.max(halfGuests - 1, 1))} cy={h / 2 - 30} r={5} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
            {Array.from({ length: guests - halfGuests }).map((_, i) => (
              <circle key={`b-${i}`} cx={w / 2 - 50 + i * (100 / Math.max(guests - halfGuests - 1, 1))} cy={h / 2 + 30} r={5} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${(halfGuests + i) * 40}ms` }} />
            ))}
          </>
        );
      }
      case 'cocktail':
      default: {
        // Scattered standing tables
        const tables = Math.ceil(guests / 4);
        return (
          <>
            {Array.from({ length: tables }).map((_, i) => {
              const angle = (i / tables) * Math.PI * 2;
              const radius = 50 + (i % 2) * 20;
              const cx = w / 2 + Math.cos(angle) * radius;
              const cy = h / 2 + Math.sin(angle) * (radius * 0.6);
              return (
                <g key={i} className="floor-plan-seat" style={{ animationDelay: `${i * 50}ms` }}>
                  <circle cx={cx} cy={cy} r={8} fill="#e5e5e5" stroke="#171717" strokeWidth={0.5} />
                  <circle cx={cx} cy={cy} r={2} fill="#171717" />
                </g>
              );
            })}
            <text x={w / 2} y={h - 10} textAnchor="middle" fontSize={7} fill="#999">Cocktail / Standing</text>
          </>
        );
      }
    }
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[280px]" style={{ height: 'auto' }}>
      <rect width={w} height={h} rx={8} fill="#FAFAFA" />
      {renderLayout()}
    </svg>
  );
}

// ─── Proposal Comparison Card ───

function ProposalComparisonCard({ drafts }: { drafts: ProposalDraft[] }) {
  if (drafts.length < 2) return null;
  
  const fmt = (n: number, currency: string) =>
    new Intl.NumberFormat('en-IE', { style: 'currency', currency: currency || 'EUR' }).format(n);

  return (
    <div className="w-full max-w-2xl venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gray-900 px-5 py-3 flex items-center gap-2">
          <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <h4 className="text-sm font-semibold text-white">Proposal Comparison</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase">Item</th>
                {drafts.map((d, i) => (
                  <th key={i} className="px-4 py-2.5 text-right text-xs font-medium text-gray-400 uppercase">
                    {i === 0 ? 'Original' : `Offer ${i}`}
                    {d.discount_applied > 0 && (
                      <span className="ml-1 text-green-600">-{d.discount_applied}%</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drafts[0].items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-gray-700">{item.name}</td>
                  {drafts.map((d, di) => {
                    const dItem = d.items[idx];
                    const prev = di > 0 ? drafts[di - 1].items[idx] : null;
                    const changed = prev && dItem && prev.total !== dItem.total;
                    return (
                      <td key={di} className={cn('px-4 py-2 text-right font-medium', changed ? (dItem.total < (prev?.total || 0) ? 'text-green-600' : 'text-red-600') : 'text-gray-700')}>
                        {dItem ? fmt(dItem.total, d.currency) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="px-4 py-2.5 text-gray-900">Total</td>
                {drafts.map((d, di) => {
                  const prev = di > 0 ? drafts[di - 1] : null;
                  const changed = prev && prev.total !== d.total;
                  return (
                    <td key={di} className={cn('px-4 py-2.5 text-right', changed ? 'text-green-600' : 'text-gray-900')}>
                      {fmt(d.total, d.currency)}
                      {changed && prev && (
                        <span className="block text-[0.65rem] font-normal text-green-500">
                          Save {fmt(prev.total - d.total, d.currency)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const VENUE_IMAGES: Record<string, { url: string; label: string }> = {
  room: {
    url: '/images/Double%20Room.jpg',
    label: 'Hotel Room / Suite',
  },
  boardroom: {
    url: '/images/Boardroom%20Grand.jpg',
    label: 'Boardroom',
  },
  banquet: {
    url: '/images/Banquet%20Grand.webp',
    label: 'Banquet Hall',
  },
  conference: {
    url: '/images/microphone%20and%20speakers.webp',
    label: 'Conference Room',
  },
  garden: {
    url: '/images/decoration.jpeg',
    label: 'Garden / Outdoor',
  },
  restaurant: {
    url: '/images/Dinner.jpg',
    label: 'Restaurant / Dining',
  },
  suite: {
    url: '/images/Suite%20Room.webp',
    label: 'Suite Room',
  },
};

function getVenueImage(venueType?: string | null): { url: string; label: string } | null {
  if (!venueType) return null;
  return VENUE_IMAGES[venueType] || null;
}

function getMessageText(message: UIMessage): string {
  const parts = Array.isArray((message as { parts?: unknown }).parts)
    ? ((message as { parts: unknown[] }).parts)
    : [];

  const textFromParts = parts
    .filter((p): p is { type: 'text'; text: string } => {
      if (!p || typeof p !== 'object') return false;
      const candidate = p as { type?: unknown; text?: unknown };
      return candidate.type === 'text' && typeof candidate.text === 'string';
    })
    .map((p) => p.text)
    .join('');

  if (textFromParts) return textFromParts;

  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : '';
}

function isRenderableMessage(message: UIMessage): boolean {
  const text = getMessageText(message).trim();
  if (text) return true;

  const parts = Array.isArray((message as { parts?: unknown }).parts)
    ? ((message as { parts: unknown[] }).parts)
    : [];

  return parts.some((part) => {
    if (!part || typeof part !== 'object') return false;
    const candidate = part as { type?: unknown; toolInvocation?: unknown };
    if (candidate.type === 'dynamic-tool') return true;
    if (typeof candidate.type === 'string' && candidate.type.startsWith('tool-')) return true;
    if (candidate.type === 'tool-invocation' && candidate.toolInvocation) return true;
    return false;
  });
}

function findQuickRepliesStartIndex(text: string, startMarker: string): number {
  const fullMatchIndex = text.indexOf(startMarker);
  if (fullMatchIndex >= 0) {
    return fullMatchIndex;
  }

  const scanStart = Math.max(0, text.length - startMarker.length + 1);
  for (let index = scanStart; index < text.length; index += 1) {
    const suffix = text.slice(index);
    if (startMarker.startsWith(suffix)) {
      return index;
    }
  }

  return -1;
}

function extractQuickReplies(text: string): { content: string; quickReplies: { label: string; message: string }[] } {
  const startMarker = '[QUICK_REPLIES]';
  const endMarker = '[/QUICK_REPLIES]';
  const quickRepliesStart = findQuickRepliesStartIndex(text, startMarker);

  if (quickRepliesStart < 0) {
    return { content: text, quickReplies: [] };
  }

  const quickRepliesEnd = text.indexOf(endMarker, quickRepliesStart + startMarker.length);
  const content = (
    quickRepliesEnd >= 0
      ? text.slice(0, quickRepliesStart) + text.slice(quickRepliesEnd + endMarker.length)
      : text.slice(0, quickRepliesStart)
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (quickRepliesEnd < 0) {
    return { content, quickReplies: [] };
  }

  const block = text.slice(quickRepliesStart + startMarker.length, quickRepliesEnd);
  const seenReplies = new Set<string>();
  const quickReplies = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*\d.()]+\s*/, ''))
    .map((line) => {
      const separatorIndex = line.indexOf('::');
      if (separatorIndex < 0) {
        return { label: line, message: line };
      }

      const label = line.slice(0, separatorIndex).trim();
      const message = line.slice(separatorIndex + 2).trim();
      return { label, message };
    })
    .map((reply) => ({
      label: reply.label.replace(/^['\"]|['\"]$/g, '').trim(),
      message: reply.message.replace(/^['\"]|['\"]$/g, '').trim(),
    }))
    .filter((reply) => reply.label.length > 0 && reply.message.length > 0)
    .filter((reply) => {
      const key = `${reply.label.toLowerCase()}::${reply.message.toLowerCase()}`;
      if (seenReplies.has(key)) {
        return false;
      }
      seenReplies.add(key);
      return true;
    })
    .slice(0, 4);

  return { content, quickReplies };
}

function generateTitle(messages: UIMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === 'user' && !getMessageText(m).startsWith('[ACTION:'));
  if (!firstUserMsg) return 'New Chat';
  const text = getMessageText(firstUserMsg);
  return text.length > 50 ? text.slice(0, 50) + '\u2026' : text;
}

function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function getThinkingLabel(toolName: string): string {
  const labels: Record<string, string> = {
    searchProposals: 'Searching proposals...',
    getProposal: 'Fetching proposal details...',
    createProposal: 'Creating proposal...',
    patchProposal: 'Updating proposal...',
    generateProposalDraft: 'Generating proposal...',
    reviseProposalPricing: 'Revising pricing...',
    listContent: 'Loading content...',
    listCompanies: 'Loading companies...',
    listTemplates: 'Loading templates...',
    analyzePortfolio: 'Analyzing portfolio...',
    renderChart: 'Generating visualization...',
    queryProposalData: 'Analyzing data...',
    suggestPricing: 'Calculating pricing...',
    extractEventDetails: 'Processing event details...',
    acceptProposal: 'Confirming booking...',
    checkAvailability: 'Checking venue availability...',
    calculateEventPrice: 'Calculating event price...',
    bookSpace: 'Reserving venue...',
    getMonthAvailability: 'Loading availability calendar...',
    suggestFloorPlan: 'Designing floor plan...',
    generateImage: 'Generating image...',
  };
  return labels[toolName] || 'Thinking...';
}

function formatMarkdown(text: string): string {
  // Convert markdown tables to HTML tables before other transformations
  text = text.replace(
    /((?:^\|.+\|$\n?)+)/gm,
    (tableBlock) => {
      const rows = tableBlock.trim().split('\n').filter(Boolean);
      if (rows.length < 2) return tableBlock;

      // Check if second row is a separator (|---|---|)
      const isSeparator = (row: string) => /^\|[\s-:|]+\|$/.test(row);
      const sepIdx = rows.findIndex((r) => isSeparator(r));
      if (sepIdx < 0) return tableBlock;

      // Parse alignment from separator row
      const sepCells = rows[sepIdx].split('|').filter(Boolean);
      const aligns = sepCells.map((c) => {
        const t = c.trim();
        if (t.startsWith(':') && t.endsWith(':')) return 'center';
        if (t.endsWith(':')) return 'right';
        return 'left';
      });

      const parseRow = (row: string) =>
        row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map((c) => c.trim());

      const headerRows = rows.slice(0, sepIdx);
      const bodyRows = rows.slice(sepIdx + 1);

      let html = '<div class="overflow-x-auto my-2"><table class="w-full text-sm border-collapse">';

      // Header
      if (headerRows.length > 0) {
        html += '<thead>';
        for (const hr of headerRows) {
          const cells = parseRow(hr);
          html += '<tr class="border-b-2 border-gray-200">';
          cells.forEach((cell, i) => {
            const align = aligns[i] || 'left';
            html += `<th class="px-3 py-2 text-${align} text-xs font-semibold text-gray-600 uppercase">${cell}</th>`;
          });
          html += '</tr>';
        }
        html += '</thead>';
      }

      // Body
      if (bodyRows.length > 0) {
        html += '<tbody>';
        for (const br of bodyRows) {
          const cells = parseRow(br);
          html += '<tr class="border-b border-gray-100">';
          cells.forEach((cell, i) => {
            const align = aligns[i] || 'left';
            html += `<td class="px-3 py-2 text-${align} text-gray-700">${cell}</td>`;
          });
          html += '</tr>';
        }
        html += '</tbody>';
      }

      html += '</table></div>';
      return html;
    },
  );

  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="rounded-lg bg-gray-50 p-3 text-xs overflow-x-auto"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4">$2</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}
