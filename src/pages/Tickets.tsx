import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/Layout";
import { toast } from "sonner";

const API_BASE_URL = window.location.origin;

type MepTicket = {
  ticket_number: string;
  creation_datetime: string;
  location: string;
  category: string;
  status: string;
  empemail: string;
  assignee_email?: string;
};

type VrTicket = {
  ticket_number: string;
  creation_datetime: string;
  number_of_people: number;
  employee_or_guest: "employee" | "guest";
  pickup_datetime: string;
  drop_datetime: string;
  status: string;
  user_email: string;
  assignee_email?: string;
};

export const Tickets: React.FC = () => {
  const { userEmail, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [mepTickets, setMepTickets] = useState<MepTicket[]>([]);
  const [vrTickets, setVrTickets] = useState<VrTicket[]>([]);
  const [assignedMepTickets, setAssignedMepTickets] = useState<MepTicket[]>([]);
  const [assignedVrTickets, setAssignedVrTickets] = useState<VrTicket[]>([]);

  const fetchTickets = useCallback(async () => {
    if (!userEmail) return;

    setLoading(true);
    try {
      const [mepMineRes, vrMineRes, mepAssignedRes, vrAssignedRes] =
        await Promise.all([
          fetch(`${API_BASE_URL}/api/mep?scope=mine`, {
            credentials: "include",
          }),
          fetch(`${API_BASE_URL}/api/vr?scope=mine`, {
            credentials: "include",
          }),
          fetch(`${API_BASE_URL}/api/mep?scope=assigned`, {
            credentials: "include",
          }),
          fetch(`${API_BASE_URL}/api/vr?scope=assigned`, {
            credentials: "include",
          }),
        ]);

      const responses = [mepMineRes, vrMineRes, mepAssignedRes, vrAssignedRes];

      if (responses.some((r) => r.status === 401)) {
        toast.error("Session expired, please log in again.");
        await logout();
        navigate("/login", { replace: true });
        return;
      }

      if (responses.some((r) => !r.ok)) {
        toast.error("Failed to fetch tickets");
        return;
      }

      const mepData = (await mepMineRes.json()) as MepTicket[];
      const vrData = (await vrMineRes.json()) as VrTicket[];
      const mepAssignedData = (await mepAssignedRes.json()) as MepTicket[];
      const vrAssignedData = (await vrAssignedRes.json()) as VrTicket[];

      setMepTickets(mepData || []);
      setVrTickets(vrData || []);
      setAssignedMepTickets(mepAssignedData || []);
      setAssignedVrTickets(vrAssignedData || []);
    } catch (err) {
      console.error("Error fetching tickets:", err);
      toast.error("Failed to fetch tickets");
    } finally {
      setLoading(false);
    }
  }, [userEmail, logout, navigate]);

  useEffect(() => {
    if (!userEmail) {
      navigate("/login", { replace: true });
      return;
    }

    fetchTickets();
  }, [userEmail, navigate, fetchTickets]);

  const handleManagerApprove = async (ticketNumber: string) => {
    if (!userEmail) {
      toast.error("You must be logged in to approve requests");
      navigate("/login", { replace: true });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/vr/${encodeURIComponent(ticketNumber)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ status: "pending" }),
        }
      );

      if (res.status === 401) {
        toast.error("Session expired, please log in again.");
        await logout();
        navigate("/login", { replace: true });
        return;
      }

      if (!res.ok) {
        let message = "Failed to approve request";
        try {
          const data = await res.json();
          if (data && data.error) {
            message = data.error;
          }
        } catch {
          // ignore JSON parse errors
        }
        toast.error(message);
        return;
      }

      toast.success("Vehicle request approved and sent to Transport.");
      await fetchTickets();
    } catch (err) {
      console.error("Error approving vehicle request:", err);
      toast.error("Failed to approve request");
    } finally {
      setLoading(false);
    }
  };

  if (!userEmail) {
    return null;
  }

  return (
    <Layout>
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>My Tickets</CardTitle>
            <p className="text-sm text-muted-foreground">
              Logged in as <span className="font-mono">{userEmail}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/create-vr">Create Vehicle Request</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await logout();
                navigate("/login", { replace: true });
              }}
            >
              Logout
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="my" className="w-full">
            <TabsList>
              <TabsTrigger value="my">My Requests</TabsTrigger>
              <TabsTrigger value="assigned">Assigned to Me</TabsTrigger>
            </TabsList>

            {/* MY REQUESTS */}
            <TabsContent value="my" className="pt-4">
              <Tabs defaultValue="mep">
                <TabsList>
                  <TabsTrigger value="mep">MEP Tickets</TabsTrigger>
                  <TabsTrigger value="vr">Vehicle Requests</TabsTrigger>
                </TabsList>

                {/* MEP TAB - MY */}
                <TabsContent value="mep" className="pt-4">
                  {loading && (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  )}
                  {!loading && mepTickets.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No MEP tickets found.
                    </p>
                  )}
                  {!loading && mepTickets.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticket #</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mepTickets.map((t) => (
                          <TableRow key={t.ticket_number}>
                            <TableCell className="font-mono text-xs">
                              {t.ticket_number}
                            </TableCell>
                            <TableCell>
                              {new Date(t.creation_datetime).toLocaleString()}
                            </TableCell>
                            <TableCell>{t.location}</TableCell>
                            <TableCell>{t.category}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{t.status}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  navigate(`/ticket-mep/${t.ticket_number}`)
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
                </TabsContent>

                {/* VR TAB - MY */}
                <TabsContent value="vr" className="pt-4">
                  {loading && (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  )}
                  {!loading && vrTickets.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No Vehicle Requests found.
                    </p>
                  )}
                  {!loading && vrTickets.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticket #</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>People</TableHead>
                          <TableHead>Pickup</TableHead>
                          <TableHead>Drop</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vrTickets.map((t) => (
                          <TableRow key={t.ticket_number}>
                            <TableCell className="font-mono text-xs">
                              {t.ticket_number}
                            </TableCell>
                            <TableCell>
                              {new Date(t.creation_datetime).toLocaleString()}
                            </TableCell>
                            <TableCell className="capitalize">
                              {t.employee_or_guest}
                            </TableCell>
                            <TableCell>{t.number_of_people}</TableCell>
                            <TableCell>
                              {new Date(t.pickup_datetime).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {new Date(t.drop_datetime).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{t.status}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  navigate(`/ticket-vr/${t.ticket_number}`)
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
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* ASSIGNED TO ME */}
            <TabsContent value="assigned" className="pt-4">
              <Tabs defaultValue="vr">
                <TabsList>
                  <TabsTrigger value="vr">Vehicle Requests</TabsTrigger>
                  <TabsTrigger value="mep">MEP Tickets</TabsTrigger>
                </TabsList>

                {/* VR TAB - ASSIGNED */}
                <TabsContent value="vr" className="pt-4">
                  {loading && (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  )}
                  {!loading && assignedVrTickets.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No Vehicle Requests assigned to you.
                    </p>
                  )}
                  {!loading && assignedVrTickets.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticket #</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>People</TableHead>
                          <TableHead>Pickup</TableHead>
                          <TableHead>Drop</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assignedVrTickets.map((t) => {
                          const canApprove = t.status === "pending_manager";

                          return (
                            <TableRow key={t.ticket_number}>
                              <TableCell className="font-mono text-xs">
                                {t.ticket_number}
                              </TableCell>
                              <TableCell>
                                {new Date(t.creation_datetime).toLocaleString()}
                              </TableCell>
                              <TableCell className="capitalize">
                                {t.employee_or_guest}
                              </TableCell>
                              <TableCell>{t.number_of_people}</TableCell>
                              <TableCell>
                                {new Date(t.pickup_datetime).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                {new Date(t.drop_datetime).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{t.status}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      navigate(`/ticket-vr/${t.ticket_number}`)
                                    }
                                  >
                                    View
                                  </Button>
                                  {canApprove && (
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleManagerApprove(t.ticket_number)
                                      }
                                      disabled={loading}
                                    >
                                      Approve
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* MEP TAB - ASSIGNED */}
                <TabsContent value="mep" className="pt-4">
                  {loading && (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  )}
                  {!loading && assignedMepTickets.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No MEP tickets assigned to you.
                    </p>
                  )}
                  {!loading && assignedMepTickets.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticket #</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assignedMepTickets.map((t) => (
                          <TableRow key={t.ticket_number}>
                            <TableCell className="font-mono text-xs">
                              {t.ticket_number}
                            </TableCell>
                            <TableCell>
                              {new Date(t.creation_datetime).toLocaleString()}
                            </TableCell>
                            <TableCell>{t.location}</TableCell>
                            <TableCell>{t.category}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{t.status}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  navigate(`/ticket-mep/${t.ticket_number}`)
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
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </Layout>
  );
};
