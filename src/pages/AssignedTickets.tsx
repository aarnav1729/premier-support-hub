import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

type Ticket = {
  ticket_number: string;
  status: string;
  creation_datetime: string;
  location?: string;
  category?: string;
  purpose_of_visit?: string;
  type: "MEP" | "VR";
  user_email: string;
};

export default function AssignedTickets() {
  const { userEmail } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetchTickets();
  }, [userEmail]);

  const fetchTickets = async () => {
    try {
      const [{ data: mepData }, { data: vrData }] = await Promise.all([
        supabase.from("mep").select("*").eq("assignee_email", userEmail).order("creation_datetime", { ascending: false }),
        supabase.from("vr").select("*").eq("assignee_email", userEmail).order("creation_datetime", { ascending: false }),
      ]);

      const allTickets: Ticket[] = [
        ...(mepData || []).map((t: any) => ({ ...t, type: "MEP" as const })),
        ...(vrData || []).map((t: any) => ({ ...t, type: "VR" as const })),
      ].sort((a, b) => new Date(b.creation_datetime).getTime() - new Date(a.creation_datetime).getTime());

      setTickets(allTickets);
    } catch (error) {
      console.error("Error fetching tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      in_progress: "default",
      completed: "secondary",
      rejected: "destructive",
    };
    return <Badge variant={variants[status] || "default"}>{status.replace("_", " ").toUpperCase()}</Badge>;
  };

  const filteredTickets = tickets.filter((ticket) => {
    if (typeFilter !== "all" && ticket.type !== typeFilter) return false;
    if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
    return true;
  });

  return (
    <Layout>
      <Card>
        <CardHeader>
          <CardTitle>Assigned Tickets</CardTitle>
          <div className="flex gap-4 mt-4">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="MEP">MEP Requests</SelectItem>
                <SelectItem value="VR">Vehicle Requests</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading tickets...</p>
          ) : filteredTickets.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No assigned tickets found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((ticket) => (
                  <TableRow key={ticket.ticket_number}>
                    <TableCell className="font-medium">{ticket.ticket_number}</TableCell>
                    <TableCell>
                      <Badge variant={ticket.type === "MEP" ? "default" : "secondary"}>{ticket.type}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                    <TableCell>{ticket.user_email}</TableCell>
                    <TableCell>{format(new Date(ticket.creation_datetime), "MMM dd, yyyy")}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {ticket.type === "MEP" ? `${ticket.location} - ${ticket.category}` : ticket.purpose_of_visit}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(
                            ticket.type === "MEP" ? `/ticket-mep/${ticket.ticket_number}` : `/ticket-vr/${ticket.ticket_number}`
                          )
                        }
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}