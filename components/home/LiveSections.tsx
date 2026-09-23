"use client";

import { Hero } from "@/components/home/Hero";
import { TodayGames } from "@/components/home/TodayGames";
import { useToday } from "@/components/home/HomeLive";
import { formatDay } from "@/lib/time";

export function LiveHero() {
  return <Hero stats={useToday().stats} />;
}

export function LiveToday() {
  const today = useToday();
  return <TodayGames today={today} />;
}

export function TodayLabel() {
  const today = useToday();
  return <span>{formatDay(`${today.date}T12:00:00Z`)}</span>;
}
