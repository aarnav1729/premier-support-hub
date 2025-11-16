import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    mepVsVr: [] as { name: string; value: number }[],
    statusBreakdown: [] as { name: string; value: number }[],
    mepByLocation: [] as { name: string; value: number }[],
    mepByCategory: [] as { name: string; value: number }[],
  });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [{ data: mepData }, { data: vrData }] = await Promise.all([
        supabase.from("mep").select("*"),
        supabase.from("vr").select("*"),
      ]);

      // MEP vs VR
      const mepVsVr = [
        { name: "MEP Requests", value: mepData?.length || 0 },
        { name: "Vehicle Requests", value: vrData?.length || 0 },
      ];

      // Status breakdown
      const allTickets = [...(mepData || []), ...(vrData || [])];
      const statusCounts = allTickets.reduce((acc: any, ticket: any) => {
        acc[ticket.status] = (acc[ticket.status] || 0) + 1;
        return acc;
      }, {});
      const statusBreakdown = Object.entries(statusCounts).map(([name, value]) => ({
        name: name.replace("_", " ").toUpperCase(),
        value: value as number,
      }));

      // MEP by location
      const locationCounts = (mepData || []).reduce((acc: any, ticket: any) => {
        acc[ticket.location] = (acc[ticket.location] || 0) + 1;
        return acc;
      }, {});
      const mepByLocation = Object.entries(locationCounts).map(([name, value]) => ({
        name,
        value: value as number,
      }));

      // MEP by category
      const categoryCounts = (mepData || []).reduce((acc: any, ticket: any) => {
        acc[ticket.category] = (acc[ticket.category] || 0) + 1;
        return acc;
      }, {});
      const mepByCategory = Object.entries(categoryCounts).map(([name, value]) => ({
        name,
        value: value as number,
      }));

      setStats({ mepVsVr, statusBreakdown, mepByLocation, mepByCategory });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  return (
    <Layout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Ticketing Analytics</CardTitle>
            <CardDescription>Overview of all tickets and their status</CardDescription>
          </CardHeader>
        </Card>

        {loading ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center">Loading analytics...</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>MEP vs Vehicle Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={stats.mepVsVr} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {stats.mepVsVr.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.statusBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>MEP Requests by Location</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.mepByLocation}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--accent))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>MEP Requests by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={stats.mepByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {stats.mepByCategory.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}