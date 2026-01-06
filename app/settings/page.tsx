import { auth } from "@/app/(auth)/auth";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Image from "next/image";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="container mx-auto py-10 px-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>
                This is how others will see you on the site.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="relative h-20 w-20 overflow-hidden rounded-full">
                  {session.user.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.name || "User avatar"}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <Avatar className="h-20 w-20">
                      <AvatarImage 
                        src="https://i.imgflip.com/30b1gx.jpg" 
                        alt="Morty Smith wearing sunglasses" 
                      />
                      <AvatarFallback>{session.user.name?.[0] || "M"}</AvatarFallback>
                    </Avatar>
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="font-medium text-lg">{session.user.name}</h3>
                  <p className="text-sm text-muted-foreground">{session.user.email}</p>
                </div>
              </div>
              
              <div className="grid gap-4 max-w-sm">
                <div className="grid gap-2">
                  <Label htmlFor="name">Display Name</Label>
                  <Input 
                    id="name" 
                    defaultValue={session.user.name || ""} 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    defaultValue={session.user.email || ""} 
                    disabled 
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
              <CardDescription>
                Manage your account preferences and settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 max-w-sm">
                <div className="grid gap-2">
                  <Label htmlFor="theme">Theme</Label>
                  <select 
                    id="theme"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    defaultValue="system"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="language">Language</Label>
                  <select 
                    id="language"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    defaultValue="en"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="privacy">
          <Card>
            <CardHeader>
              <CardTitle>Privacy Settings</CardTitle>
              <CardDescription>
                Control your data privacy and usage preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 max-w-sm">
                <div className="flex items-center space-x-2">
                  <input type="checkbox" id="analytics" defaultChecked />
                  <Label htmlFor="analytics">Enable analytics and usage data collection</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input type="checkbox" id="training" defaultChecked />
                  <Label htmlFor="training">Allow training on chat data</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Note: With training on chats disabled, only models that do not train on chat data will be available, which may limit your options.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
              <CardDescription>
                Manage your subscription and payment methods.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 max-w-sm">
                <p className="text-sm text-muted-foreground">
                  Billing integration with Stripe is coming soon. Placeholder for subscription plans, payment history, and card management.
                </p>
                <div className="space-y-2">
                  <Label>Current Plan</Label>
                  <p className="text-sm">Free Tier</p>
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <p className="text-sm">No payment method on file</p>
                </div>
                <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
                  Manage Billing (Stripe Placeholder)
                </button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
