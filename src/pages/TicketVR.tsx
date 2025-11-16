import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";

export default function TicketVR() {
  const { ticketNumber } = useParams();
  const { userEmail } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverNumber, setDriverNumber] = useState("");
  const [loading, setLoading] = useState(true);

  const isAssignee = ticket && userEmail === ticket.assignee_email;
  const isRequester = ticket && userEmail === ticket.user_email;

  useEffect(() => {
    if (ticketNumber) {
      fetchTicketDetails();
      subscribeToChat();
    }
  }, [ticketNumber]);

  const subscribeToChat = () => {
    const channel = supabase
      .channel(`chat-${ticketNumber}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `ticket_number=eq.${ticketNumber}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const fetchTicketDetails = async () => {
    try {
      const [{ data: ticketData }, { data: historyData }, { data: messagesData }] = await Promise.all([
        supabase.from("vr").select("*").eq("ticket_number", ticketNumber).single(),
        supabase.from("history").select("*").eq("ticket_number", ticketNumber).order("timestamp", { ascending: true }),
        supabase.from("chat_messages").select("*").eq("ticket_number", ticketNumber).order("created_at", { ascending: true }),
      ]);

      setTicket(ticketData);
      setHistory(historyData || []);
      setMessages(messagesData || []);
      setFeedback(ticketData?.feedback || "");
      setDriverName(ticketData?.driver_name || "");
      setDriverNumber(ticketData?.driver_number || "");
    } catch (error) {
      console.error("Error fetching ticket:", error);
      toast.error("Failed to load ticket");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    try {
      const { error } = await supabase.from("vr").update({ status: newStatus }).eq("ticket_number", ticketNumber);

      if (error) throw error;

      toast.success("Status updated successfully");
      fetchTicketDetails();
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleDriverUpdate = async () => {
    try {
      const { error } = await supabase
        .from("vr")
        .update({ driver_name: driverName, driver_number: driverNumber })
        .eq("ticket_number", ticketNumber);

      if (error) throw error;

      toast.success("Driver details updated successfully");
      fetchTicketDetails();
    } catch (error) {
      toast.error("Failed to update driver details");
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const { error } = await supabase.from("chat_messages").insert({
        ticket_number: ticketNumber,
        sender_email: userEmail,
        message: newMessage,
      });

      if (error) throw error;

      setNewMessage("");
    } catch (error) {
      toast.error("Failed to send message");
    }
  };

  const handleFeedbackSubmit = async () => {
    try {
      const { error } = await supabase.from("vr").update({ feedback }).eq("ticket_number", ticketNumber);

      if (error) throw error;

      toast.success("Feedback submitted successfully");
      fetchTicketDetails();
    } catch (error) {
      toast.error("Failed to submit feedback");
    }
  };

  if (loading) {
    return (
      <Layout>
        <Card>
          <CardContent className="py-8">
            <p className="text-center">Loading ticket details...</p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  if (!ticket) {
    return (
      <Layout>
        <Card>
          <CardContent className="py-8">
            <p className="text-center">Ticket not found</p>
            <Button onClick={() => navigate("/tickets")} className="mt-4 mx-auto block">
              Back to Tickets
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      in_progress: "default",
      completed: "secondary",
      rejected: "destructive",
    };
    return <Badge variant={variants[status] || "default"}>{status.replace("_", " ").toUpperCase()}</Badge>;
  };

  return (
    <Layout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Vehicle Request: {ticket.ticket_number}</CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Created: {format(new Date(ticket.creation_datetime), "PPpp")}
                </p>
              </div>
              {getStatusBadge(ticket.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Number of People</Label>
                <p className="font-medium">{ticket.number_of_people}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Type</Label>
                <p className="font-medium capitalize">{ticket.employee_or_guest}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Pickup Date & Time</Label>
                <p className="font-medium">{format(new Date(ticket.pickup_datetime), "PPpp")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Drop Date & Time</Label>
                <p className="font-medium">{format(new Date(ticket.drop_datetime), "PPpp")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Contact Number</Label>
                <p className="font-medium">{ticket.contact_number}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Assignee</Label>
                <p className="font-medium">{ticket.assignee_email}</p>
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">Passengers</Label>
              <div className="mt-1 space-y-1">
                {ticket.names.map((name: string, idx: number) => (
                  <p key={idx} className="text-sm">
                    {idx + 1}. {name}
                  </p>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">Purpose of Visit</Label>
              <p className="mt-1">{ticket.purpose_of_visit}</p>
            </div>

            {ticket.description && (
              <div>
                <Label className="text-muted-foreground">Additional Details</Label>
                <p className="mt-1 text-sm">{ticket.description}</p>
              </div>
            )}

            {isAssignee && (
              <>
                <div className="pt-4 border-t space-y-4">
                  <div>
                    <Label>Update Status</Label>
                    <Select value={ticket.status} onValueChange={handleStatusUpdate}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Driver Name</Label>
                      <Input
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        placeholder="Enter driver name"
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label>Driver Number</Label>
                      <Input
                        value={driverNumber}
                        onChange={(e) => setDriverNumber(e.target.value)}
                        placeholder="Enter driver number"
                        className="mt-2"
                      />
                    </div>
                  </div>
                  <Button onClick={handleDriverUpdate}>Update Driver Details</Button>
                </div>
              </>
            )}

            {ticket.driver_name && (
              <div className="pt-4 border-t">
                <Label className="text-muted-foreground">Driver Details</Label>
                <p className="mt-1">
                  <strong>Name:</strong> {ticket.driver_name}
                </p>
                <p>
                  <strong>Number:</strong> {ticket.driver_number}
                </p>
              </div>
            )}

            {isRequester && ticket.status === "completed" && (
              <div className="pt-4 border-t">
                <Label>Feedback</Label>
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Share your feedback..."
                  className="mt-2"
                  rows={3}
                />
                <Button onClick={handleFeedbackSubmit} className="mt-2">
                  Submit Feedback
                </Button>
              </div>
            )}

            {ticket.feedback && (
              <div className="pt-4 border-t">
                <Label className="text-muted-foreground">User Feedback</Label>
                <p className="mt-1 text-sm">{ticket.feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chat</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4 mb-4">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_email === userEmail ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${
                        msg.sender_email === userEmail ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}
                    >
                      <p className="text-sm font-medium mb-1">{msg.sender_email}</p>
                      <p className="text-sm">{msg.message}</p>
                      <p className="text-xs opacity-70 mt-1">{format(new Date(msg.created_at), "MMM dd, hh:mm a")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <Button onClick={handleSendMessage} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h.id} className="flex justify-between items-start border-b pb-2">
                  <div>
                    <p className="font-medium">{h.action_type.replace("_", " ").toUpperCase()}</p>
                    {h.comment && <p className="text-sm text-muted-foreground">{h.comment}</p>}
                    {h.before_state && h.after_state && (
                      <p className="text-sm text-muted-foreground">
                        {h.before_state} → {h.after_state}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{format(new Date(h.timestamp), "MMM dd, hh:mm a")}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}