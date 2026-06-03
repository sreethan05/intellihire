import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { NotificationItem } from "@/types";

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const load = () => api.get("/notifications").then((res) => setItems(res.data.data));
  useEffect(() => { load(); }, []);
  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-semibold">Notifications</h1><Button onClick={() => api.put("/notifications/read-all").then(load)}>Mark all read</Button></div>
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className={!item.read ? "border-l-4 border-l-primary" : ""}>
            <CardContent className="flex items-start justify-between gap-4">
              <div><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.message}</p></div>
              {!item.read && <Button variant="outline" onClick={() => api.put(`/notifications/${item.id}/read`).then(load)}>Read</Button>}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

