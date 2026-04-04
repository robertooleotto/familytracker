import React from "react";
import { 
  CloudSun, 
  Wind,
  AlertCircle,
  MessageCircle,
  Calendar,
  CheckCircle2,
  ShoppingCart,
  Pill,
  MapPin,
  Heart,
  ChevronRight,
  ArrowRight
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function FeedPriorita() {
  return (
    <div className="w-[390px] min-h-[800px] h-[800px] bg-background text-foreground flex flex-col overflow-hidden font-sans border border-border">
      
      {/* HEADER SECTION */}
      <div className="px-5 pt-8 pb-4 bg-background z-10 sticky top-0">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Johnson Family</p>
            <h1 className="text-2xl font-bold tracking-tight">Buonasera, Sarah 👋</h1>
          </div>
          <Avatar className="h-12 w-12 border-2 border-background shadow-sm cursor-pointer">
            <AvatarFallback className="bg-blue-500 text-white text-lg">S</AvatarFallback>
          </Avatar>
        </div>

        {/* Weather Pill */}
        <div className="flex items-center gap-3 bg-muted/50 rounded-full px-4 py-2 text-sm font-medium">
          <div className="flex items-center text-blue-500">
            <CloudSun className="w-4 h-4 mr-1.5" />
            <span>18°C</span>
          </div>
          <span className="text-muted-foreground">•</span>
          <span className="text-foreground">Parzialmente nuvoloso</span>
          <span className="text-muted-foreground">•</span>
          <div className="flex items-center text-muted-foreground">
            <Wind className="w-3.5 h-3.5 mr-1" />
            <span>12 km/h</span>
          </div>
        </div>
      </div>

      {/* FAMILY MEMBERS ROW */}
      <div className="px-5 pb-4 border-b border-border/50">
        <div className="flex gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <div className="relative">
              <Avatar className="h-14 w-14 border-2 border-background ring-2 ring-blue-500 ring-offset-1 ring-offset-background">
                <AvatarFallback className="bg-blue-100 text-blue-700">S</AvatarFallback>
              </Avatar>
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full"></div>
            </div>
            <span className="text-xs font-medium">Sarah</span>
          </div>
          
          <div className="flex flex-col items-center gap-1.5 opacity-80">
            <div className="relative">
              <Avatar className="h-14 w-14 border-2 border-background">
                <AvatarFallback className="bg-green-100 text-green-700">M</AvatarFallback>
              </Avatar>
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-gray-400 border-2 border-background rounded-full"></div>
            </div>
            <span className="text-xs font-medium">Mike</span>
          </div>

          <div className="flex flex-col items-center gap-1.5 opacity-80">
            <div className="relative">
              <Avatar className="h-14 w-14 border-2 border-background">
                <AvatarFallback className="bg-amber-100 text-amber-700">E</AvatarFallback>
              </Avatar>
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-gray-400 border-2 border-background rounded-full"></div>
            </div>
            <span className="text-xs font-medium">Emma</span>
          </div>
        </div>
      </div>

      {/* FEED (SCROLLABLE) */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          
          {/* ALERT ROW */}
          <div className="relative group cursor-pointer hover:bg-accent/30 transition-colors border-b border-border/50">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-red-100 p-2 rounded-full text-red-600">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">1 scadenza in arrivo</h3>
                  <p className="text-sm text-muted-foreground">Bolletta Luce in scadenza tra 2 giorni</p>
                </div>
              </div>
              <div className="flex items-center text-sm font-medium text-red-600">
                Tocca <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </div>
          </div>

          {/* MESSAGES ROW */}
          <div className="relative group cursor-pointer hover:bg-accent/30 transition-colors border-b border-border/50">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-blue-500" />
                  Messaggi
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 ml-1">1 non letto</Badge>
                </h3>
              </div>
              
              <div className="space-y-3 mt-3">
                <div className="flex items-start gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-amber-100 text-amber-700 text-xs">E</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-bold">Emma</span>
                      <span className="text-xs text-blue-600 font-medium">1m fa</span>
                    </div>
                    <p className="text-base text-foreground font-medium">Can we have pizza tonight? 🍕</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 opacity-60">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-green-100 text-green-700 text-xs">M</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-semibold">Mike</span>
                      <span className="text-xs text-muted-foreground">2h fa</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Thanks for the reminder!</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* EVENTS ROW 1 */}
          <div className="relative group cursor-pointer hover:bg-accent/30 transition-colors border-b border-border/50">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <div>
                  <h3 className="text-lg font-semibold">Soccer Practice</h3>
                  <p className="text-sm text-amber-600 font-medium">Oggi 10:36</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          {/* EVENTS ROW 2 */}
          <div className="relative group cursor-pointer hover:bg-accent/30 transition-colors border-b border-border/50">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-400"></div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div>
                  <h3 className="text-lg font-medium text-foreground">Family Dinner</h3>
                  <p className="text-sm text-muted-foreground">dom 8:36</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          {/* TASKS ROW */}
          <div className="relative group cursor-pointer hover:bg-accent/30 transition-colors border-b border-border/50">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500"></div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-orange-500" />
                <h3 className="text-lg font-medium">1 compito in attesa</h3>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          {/* SHOPPING ROW */}
          <div className="relative group cursor-pointer hover:bg-accent/30 transition-colors border-b border-border/50">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-medium">4 articoli nella lista</h3>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          {/* MEDS ROW */}
          <div className="relative group cursor-pointer hover:bg-accent/30 transition-colors border-b border-border/50">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Pill className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-medium">Farmaci attivi</h3>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          {/* GEOFENCES ROW */}
          <div className="relative group cursor-pointer hover:bg-accent/30 transition-colors border-b border-border/50">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-blue-500" />
                <h3 className="text-lg font-medium">Zone sicure</h3>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          {/* BOTTOM PADDING */}
          <div className="h-6"></div>
        </div>
      </ScrollArea>

      {/* INVITE CODE */}
      <div className="bg-primary/5 border-t border-primary/10 px-5 py-4 mt-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Heart className="w-4 h-4 fill-primary/20" />
            <span className="text-sm font-medium">Codice Famiglia</span>
          </div>
          <div className="font-mono bg-background px-3 py-1 rounded border border-border text-sm font-bold tracking-widest text-foreground shadow-sm">
            DEMO1234
          </div>
        </div>
      </div>

    </div>
  );
}
