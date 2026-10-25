"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  MessageCircle,
  Moon,
  Settings2,
  RotateCcw,
  Sun,
  Trash2,
  Vote,
} from "lucide-react";
import { useTheme } from "next-themes";
import { AgentMascot } from "@/components/agent/agent-mascot";
import { BrandLogo } from "@/components/brand-logo";
import { agentStateLabels } from "@/lib/ai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCityAgent } from "./use-city-agent";
import { CityResultCard } from "./city-result-card";
import { ResidentInput } from "./resident-input";
import { RecreationBookingPanel } from "./recreation-booking-panel";
import { ConversationComposer } from "./conversation-composer";
import { MessageBubble } from "./message-bubble";
import { AgentActivity } from "./agent-activity";
import { MessageSources } from "./source-disclosure";
import { useAppViewport } from "./use-app-viewport";

type Surface = "concierge" | "tasks" | "you";
const navigation = [
  { id: "concierge", label: "Chat", icon: MessageCircle },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
] as const;
const suggestions = [
  {
    title: "Where do I vote?",
    request:
      "Help me find my Toronto municipal election voting place. What do you need from me?",
    icon: Vote,
  },
  {
    title: "Find recreation activities",
    request:
      "Help me find City of Toronto recreation activities. Ask me what I’d like to play, where and when. Do not book anything.",
    icon: CalendarDays,
  },
];
export type CityAgentView = Pick<
  ReturnType<typeof useCityAgent>,
  | "status"
  | "messages"
  | "mascot"
  | "results"
  | "booking"
  | "configuration"
  | "errorMessage"
  | "setFocused"
  | "send"
  | "clear"
  | "stopRequest"
  | "retry"
>;

export function TorontoOne() {
  const agent = useCityAgent();
  return <TorontoOneView agent={agent} />;
}

export function TorontoOneView({
  agent,
  initialSurface = "concierge",
}: {
  agent: CityAgentView;
  initialSurface?: Surface;
}) {
  useAppViewport();
  const [surface, setSurface] = useState<Surface>(initialSurface);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const scrollViewport = useRef<HTMLDivElement>(null);
  const screenBody = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const readingPositions = useRef<Record<Surface, { top: number; follow: boolean }>>({
    concierge: { top: 0, follow: true },
    tasks: { top: 0, follow: false },
    you: { top: 0, follow: false },
  });
  const [showLatest, setShowLatest] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const { theme, setTheme } = useTheme();
  const chatProcessing = agent.status === "submitted" || agent.status === "streaming";
  const processing =
    chatProcessing ||
    agent.booking.busy ||
    ["preparing", "executing"].includes(agent.booking.state?.status ?? "");
  const hasConversation = agent.messages.length > 0;
  const latestAssistant = agent.messages.findLast(
    (message) => message.role === "assistant",
  );
  const activeAssistant =
    latestAssistant === agent.messages.at(-1) ? latestAssistant : undefined;
  const hasActiveSteps =
    activeAssistant?.parts.some(
      (part) =>
        part.type.startsWith("tool-") &&
        part.type !== "tool-requestResidentInput" &&
        part.type !== "tool-publishResult",
    ) ?? false;
  function navigate(next: Surface) {
    const viewport = scrollViewport.current;
    if (next === surface) {
      follow.current = false;
      viewport?.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    readingPositions.current[surface] = {
      top: viewport?.scrollTop ?? 0,
      follow: follow.current,
    };
    setSurface(next);
  }
  useLayoutEffect(() => {
    const saved = readingPositions.current[surface];
    follow.current = saved.follow;
    const viewport = scrollViewport.current;
    viewport?.scrollTo({
      top: surface === "concierge" && saved.follow ? viewport.scrollHeight : saved.top,
      behavior: "instant",
    });
    setShowLatest(surface === "concierge" && !saved.follow && hasConversation);
  }, [surface, hasConversation]);
  useEffect(() => {
    if (surface !== "concierge" || !hasConversation) return;
    const scroll = () => {
      if (follow.current)
        scrollViewport.current?.scrollTo({
          top: scrollViewport.current.scrollHeight,
          behavior: "instant",
        });
    };
    const observer = new ResizeObserver(scroll);
    if (screenBody.current) observer.observe(screenBody.current);
    if (scrollViewport.current) observer.observe(scrollViewport.current);
    scroll();
    return () => observer.disconnect();
  }, [surface, hasConversation]);
  function send(text: string) {
    if (!text.trim() || processing) return;
    follow.current = true;
    setShowLatest(false);
    setInput("");
    void agent.send(text);
  }
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="desktop-sidebar" aria-label="Toronto One sidebar">
        <div className="sidebar-brand">
          <BrandLogo />
        </div>
        <nav className="sidebar-navigation" aria-label="Sidebar navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              className={cn("sidebar-link", surface === id && "is-active")}
              aria-current={surface === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </Button>
          ))}
          <Button
            variant="ghost"
            className={cn(
              "sidebar-link sidebar-settings",
              surface === "you" && "is-active",
            )}
            aria-current={surface === "you" ? "page" : undefined}
            onClick={() => navigate("you")}
          >
            <Settings2 size={20} aria-hidden="true" />
            <span>Settings</span>
          </Button>
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div className="header-brand">
            <BrandLogo />
          </div>
          <div className="companion-header">
            <AgentMascot state={agent.mascot} size="companion" />
          </div>
          <Button
            className="header-action"
            variant="ghost"
            size="icon"
            aria-label="Open settings"
            onClick={() => navigate("you")}
          >
            <Settings2 size={21} aria-hidden="true" />
          </Button>
        </header>
        <main
          id="main"
          className={cn("main-content", surface === "concierge" && "concierge-content")}
        >
          <div
            className="screen-scroll"
            ref={scrollViewport}
            onScroll={(event) => {
              const element = event.currentTarget;
              const near =
                element.scrollHeight - element.scrollTop - element.clientHeight < 100;
              follow.current = near;
              readingPositions.current[surface] = {
                top: element.scrollTop,
                follow: near,
              };
              setShowLatest(!near && hasConversation && surface === "concierge");
            }}
          >
            <div className="screen-body" ref={screenBody}>
              {agent.configuration?.configured === false && (
                <p role="status" className="storage-note">
                  AI access needs setup. Add the server’s AI Gateway key to begin.
                </p>
              )}
              {surface === "concierge" ? (
                <>
                  {!hasConversation ? (
                    <section
                      className="welcome"
                      data-drafting={inputFocused || input.length > 0}
                      aria-labelledby="welcome-heading"
                    >
                      <h1 id="welcome-heading">Hey, neighbour.</h1>
                      <p className="welcome-description">
                        City services, one message away.
                      </p>
                      <div className="suggestions">
                        <div>
                          {suggestions.map(({ title, request, icon: Icon }) => (
                            <button
                              key={title}
                              type="button"
                              className="suggestion"
                              disabled={processing}
                              onClick={() => send(request)}
                            >
                              <span className="suggestion-icon">
                                <Icon size={20} aria-hidden="true" />
                              </span>
                              <span>
                                <strong>{title}</strong>
                              </span>
                              <ArrowRight size={16} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>
                  ) : (
                    <section
                      className="conversation"
                      aria-label="Conversation with Toronto One"
                    >
                      <h1 className="sr-only">Your conversation</h1>
                      <div
                        className="messages"
                        role="log"
                        aria-label="Conversation messages"
                        aria-live="polite"
                        aria-relevant="additions"
                      >
                        {agent.messages.map((message, messageIndex) => (
                          <div
                            key={message.id}
                            data-continuation={
                              agent.messages[messageIndex - 1]?.role === message.role
                            }
                            className={cn(
                              "agent-message-group",
                              `group-${message.role}`,
                            )}
                          >
                            {message.role === "assistant" && (
                              <AgentActivity
                                message={message}
                                active={chatProcessing && message === activeAssistant}
                              />
                            )}
                            {message.parts.map((part, index) => {
                              if (
                                part.type === "text" &&
                                message.parts.some(
                                  (item) =>
                                    item.type === "tool-requestStreetAddress" &&
                                    item.state === "output-available",
                                )
                              )
                                return null;
                              if (part.type === "text")
                                return (
                                  <MessageBubble
                                    key={index}
                                    text={part.text}
                                    resident={message.role === "user"}
                                    showActions={
                                      !message.parts
                                        .slice(index + 1)
                                        .some(
                                          (next) =>
                                            next.type === "text" &&
                                            next.text.trim().length > 0,
                                        )
                                    }
                                  />
                                );
                              if (
                                part.type === "tool-publishResult" &&
                                part.state === "output-available"
                              )
                                return (
                                  <CityResultCard
                                    key={part.toolCallId}
                                    showSources={false}
                                    result={
                                      agent.results.find(
                                        (result) => result.id === part.output.id,
                                      ) ?? part.output
                                    }
                                    onPrepare={(id) => {
                                      void agent.booking.action({
                                        action: "prepare",
                                        resultId: id,
                                      });
                                    }}
                                  />
                                );
                              if (
                                part.type === "tool-requestStreetAddress" &&
                                part.state === "output-available"
                              ) {
                                const current =
                                  message === activeAssistant &&
                                  agent.messages.at(-1) === message;
                                if (!current)
                                  return (
                                    <MessageBubble
                                      key={part.toolCallId}
                                      text={part.output.question}
                                      resident={false}
                                    />
                                  );
                                return (
                                  <ResidentInput
                                    key={part.toolCallId}
                                    address
                                    question={part.output.question}
                                    disabled={!current || processing}
                                    onSubmit={send}
                                  />
                                );
                              }
                              if (
                                part.type === "tool-requestResidentInput" &&
                                part.state === "output-available"
                              ) {
                                if (part.output.choices?.length)
                                  return (
                                    <ResidentInput
                                      key={part.toolCallId}
                                      question={part.output.question}
                                      choices={part.output.choices}
                                      disabled={
                                        processing || agent.messages.at(-1) !== message
                                      }
                                      onSubmit={send}
                                    />
                                  );
                                if (
                                  message.parts
                                    .slice(index + 1)
                                    .some(
                                      (next) =>
                                        next.type === "text" &&
                                        next.text.trim().length > 0,
                                    )
                                )
                                  return null;
                                return (
                                  <MessageBubble
                                    key={part.toolCallId}
                                    text={part.output.question}
                                    resident={false}
                                  />
                                );
                              }
                              return null;
                            })}
                            {message.role === "assistant" && (
                              <MessageSources message={message} />
                            )}
                          </div>
                        ))}
                      </div>
                      {chatProcessing && !hasActiveSteps && (
                        <p className="thinking-label" role="status">
                          <span className="processing-dot" aria-hidden="true" />
                          {agentStateLabels[agent.mascot]}…
                        </p>
                      )}
                    </section>
                  )}
                  {agent.booking.state &&
                    (agent.booking.busy ||
                      !["disconnected", "ready"].includes(
                        agent.booking.state.status,
                      )) && (
                      <div className="conversation-booking">
                        <RecreationBookingPanel booking={agent.booking} />
                        <Button
                          variant="link"
                          className="view-task"
                          onClick={() => navigate("tasks")}
                        >
                          View in Tasks <ArrowRight size={15} aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  {agent.errorMessage && (
                    <div className="inline-error" role="alert">
                      <p>{agent.errorMessage}</p>
                      {!processing && (
                        <Button variant="outline" onClick={agent.retry}>
                          <RotateCcw size={15} aria-hidden="true" />
                          Retry last message
                        </Button>
                      )}
                    </div>
                  )}
                  <div ref={bottom} className="conversation-end" />
                </>
              ) : surface === "tasks" ? (
                <section className="surface-page" aria-labelledby="tasks-heading">
                  <div className="surface-title tasks-title">
                    <h1 id="tasks-heading">Tasks</h1>
                    <Badge variant="secondary">
                      {agent.results.length + (agent.booking.state?.activity ? 1 : 0)}
                    </Badge>
                  </div>
                  {agent.booking.state?.activity && (
                    <RecreationBookingPanel booking={agent.booking} />
                  )}
                  {agent.results.length ? (
                    <div className="space-y-5">
                      {agent.results.map((result) => (
                        <CityResultCard
                          key={result.id}
                          result={result}
                          onPrepare={(id) =>
                            void agent.booking.action({
                              action: "prepare",
                              resultId: id,
                            })
                          }
                        />
                      ))}
                    </div>
                  ) : !agent.booking.state?.activity ? (
                    <div className="empty-state">
                      <AgentMascot state="idle" size="companion" motion="off" />
                      <h2>Nothing here yet.</h2>
                      <p>Your findings and reservations will appear here.</p>
                      <Button onClick={() => navigate("concierge")}>
                        Back to chat <ArrowRight aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}
                </section>
              ) : (
                <section className="surface-page" aria-labelledby="you-heading">
                  <div className="surface-title">
                    <h1 id="you-heading">Settings</h1>
                  </div>
                  <RecreationBookingPanel booking={agent.booking} accountOnly />
                  <Card className="preferences-card">
                    <CardContent>
                      <h2>Appearance</h2>
                      <fieldset className="theme-options">
                        <legend className="sr-only">Appearance</legend>
                        {[
                          { id: "system", label: "System", icon: CircleHelp },
                          { id: "light", label: "Light", icon: Sun },
                          { id: "dark", label: "Dark", icon: Moon },
                        ].map(({ id, label, icon: Icon }) => (
                          <Button
                            key={id}
                            variant={theme === id ? "default" : "outline"}
                            aria-pressed={theme === id}
                            onClick={() => setTheme(id)}
                          >
                            <Icon size={17} aria-hidden="true" />
                            {label}
                          </Button>
                        ))}
                      </fieldset>
                    </CardContent>
                  </Card>
                  <Card className="preferences-card">
                    <CardContent>
                      <h2>Privacy</h2>
                      <p>
                        Messages use our AI provider. Never share passwords or payment
                        details here.
                      </p>
                      <details className="privacy-details">
                        <summary>How your information is used</summary>
                        <p>
                          Your messages are sent through our AI provider. When
                          requested, your address is entered into MyVote for a public
                          voting-place lookup. Don’t share passwords, voter IDs, payment
                          details or identity documents here.
                        </p>
                        <p className="mt-3">
                          Your temporary session expires after 20 minutes of inactivity.
                          Public findings and City sign-in are lost on restart. A
                          verified booking can restore to this session without
                          credentials or approval authority. Clearing the session
                          revokes that record; private receipt files remain on this
                          computer. This is not a production account.
                        </p>
                      </details>
                      <Button
                        variant="outline"
                        className="clear-data"
                        disabled={processing}
                        onClick={() => setClearOpen(true)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        Clear session
                      </Button>
                    </CardContent>
                  </Card>
                </section>
              )}
            </div>
          </div>
          {surface === "concierge" && (
            <div className="composer-area">
              {showLatest && (
                <Button
                  variant="secondary"
                  className="latest-message"
                  onClick={() => {
                    follow.current = true;
                    setShowLatest(false);
                    bottom.current?.scrollIntoView({
                      block: "end",
                      behavior: "instant",
                    });
                  }}
                >
                  Latest message <ArrowRight size={15} aria-hidden="true" />
                </Button>
              )}
              <ConversationComposer
                value={input}
                onChange={setInput}
                onSend={send}
                onStop={agent.stopRequest}
                onFocusChange={(focused) => {
                  setInputFocused(focused);
                  agent.setFocused(focused);
                }}
                inputRef={composer}
                chatProcessing={chatProcessing}
                disabled={processing}
              />
            </div>
          )}
        </main>
        <nav className="mobile-navigation" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              className={cn(surface === id && "is-active")}
              aria-current={surface === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </Button>
          ))}
        </nav>
      </div>
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear this conversation?</DialogTitle>
            <DialogDescription>
              Removes this conversation, findings, City sign-in and the restored booking
              view. It does not cancel a City reservation. Private receipt files and the
              write-safety journal remain on this computer; provider retention follows
              its own terms.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              Keep session
            </Button>
            <Button
              onClick={() => {
                void agent.clear().then((ok) => {
                  if (ok) {
                    setInput("");
                    setClearOpen(false);
                  }
                });
              }}
            >
              Clear session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
