export type ChatSide = "student" | "instructor";

/** One chat message as read back for a thread. */
export type ChatMessage = {
  id: string;
  conversationId: string;
  senderSide: ChatSide;
  body: string;
  createdAt: string;
};

/** A conversation as shown in the instructor inbox / student picker. */
export type ChatConversationSummary = {
  id: string;
  studentId: string;
  studentName: string;
  instructorId: string;
  instructorName: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
};

/** A loaded thread: the conversation metadata + ordered messages. */
export type ChatThreadData = {
  conversationId: string;
  side: ChatSide;
  counterpartName: string;
  messages: ChatMessage[];
};
