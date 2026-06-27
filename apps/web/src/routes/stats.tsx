import { useQuery } from '@tanstack/react-query'
import { Flame, Trophy, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'

import type { BodyWeight, FrequencyPoint, PersonalRecord, VolumePoint } from '@gymtracker/shared'

import { statsApi } from '@/api/stats'

function StatCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border-border rounded-xl border ${className}`}>{children}</div>
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border border-b px-4 py-3">
      <h2 className="font-display font-600 text-muted-foreground text-sm tracking-widest uppercase">{children}</h2>
    </div>
  )
}

const chartProps = {
  tick: { fill: '#94A3B8', fontSize: 11, fontFamily: 'Barlow' },
  axisLine: { stroke: '#334155' },
  tickLine: false,
}

export function StatsPage() {
  const { t, i18n } = useTranslation('stats')
  const { data: prs = [] } = useQuery({ queryKey: ['stats', 'prs'], queryFn: () => statsApi.getPRs() })
  const { data: volume = [] } = useQuery({ queryKey: ['stats', 'volume'], queryFn: () => statsApi.getVolume() })
  const { data: streak } = useQuery({ queryKey: ['stats', 'streak'], queryFn: statsApi.getStreak })
  const { data: bodyWeight = [] } = useQuery({
    queryKey: ['stats', 'bodyweight'],
    queryFn: () => statsApi.getBodyWeight(),
  })
  const { data: frequency = [] } = useQuery({ queryKey: ['stats', 'frequency'], queryFn: statsApi.getFrequency })

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="pt-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{t('eyebrow')}</p>
        <h1 className="font-display font-700 text-3xl tracking-wide">{t('title')}</h1>
      </div>

      {streak && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard>
            <div className="flex flex-col items-center gap-1 p-4">
              <div className="text-primary mb-1 flex items-center gap-1.5">
                <Flame size={16} />
                <span className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
                  {t('current')}
                </span>
              </div>
              <p className="font-display font-700 text-primary text-5xl">{streak.current}</p>
              <p className="text-muted-foreground text-xs">{t('dayStreak')}</p>
            </div>
          </StatCard>
          <StatCard>
            <div className="flex flex-col items-center gap-1 p-4">
              <div className="mb-1 flex items-center gap-1.5">
                <Trophy className="text-yellow-500" size={16} />
                <span className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
                  {t('best')}
                </span>
              </div>
              <p className="font-display font-700 text-foreground text-5xl">{streak.longest}</p>
              <p className="text-muted-foreground text-xs">{t('dayStreak')}</p>
            </div>
          </StatCard>
        </div>
      )}

      {prs.length > 0 && (
        <StatCard>
          <SectionHeader>
            <div className="flex items-center gap-2">
              <Trophy className="text-yellow-500" size={14} />
              {t('personalRecords')}
            </div>
          </SectionHeader>
          <div className="divide-border/50 divide-y">
            {prs.map((pr: PersonalRecord) => (
              <div key={pr.exercise_id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium">{pr.name}</span>
                <div className="flex items-center gap-1">
                  <span className="font-display font-700 text-primary text-lg">{pr.maxWeightKg}</span>
                  <span className="text-muted-foreground text-xs">{t('prReps', { reps: pr.repsAtMax })}</span>
                </div>
              </div>
            ))}
          </div>
        </StatCard>
      )}

      {volume.length > 0 && (
        <StatCard>
          <SectionHeader>
            <div className="flex items-center gap-2">
              <TrendingUp size={14} />
              {t('volumeOverTime')}
            </div>
          </SectionHeader>
          <div className="p-4">
            <ResponsiveContainer height={180} width="100%">
              <LineChart data={volume as VolumePoint[]}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis dataKey="date" {...chartProps} />
                <YAxis {...chartProps} />
                <Tooltip
                  contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#F8FAFC' }}
                />
                <Line dataKey="volume" dot={false} stroke="#F97316" strokeWidth={2} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </StatCard>
      )}

      {bodyWeight.length > 0 && (
        <StatCard>
          <SectionHeader>{t('bodyWeight')}</SectionHeader>
          <div className="p-4">
            <ResponsiveContainer height={180} width="100%">
              <LineChart data={bodyWeight as BodyWeight[]}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis
                  dataKey="recordedAt"
                  tickFormatter={(v: number) =>
                    new Date(v * 1000).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })
                  }
                  {...chartProps}
                />
                <YAxis {...chartProps} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v: number) => new Date(v * 1000).toLocaleDateString()}
                  labelStyle={{ color: '#F8FAFC' }}
                />
                <Line dataKey="weightKg" dot={false} stroke="#22C55E" strokeWidth={2} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </StatCard>
      )}

      {frequency.length > 0 && (
        <StatCard>
          <SectionHeader>{t('weeklyFrequency')}</SectionHeader>
          <div className="p-4">
            <ResponsiveContainer height={160} width="100%">
              <BarChart data={frequency as FrequencyPoint[]}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                <XAxis dataKey="week" {...chartProps} />
                <YAxis {...chartProps} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#F8FAFC' }}
                />
                <Bar dataKey="count" fill="#F97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </StatCard>
      )}

      {!prs.length && !volume.length && !streak?.current && (
        <div className="border-border rounded-xl border border-dashed p-10 text-center">
          <TrendingUp className="text-muted-foreground mx-auto mb-2" size={32} />
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        </div>
      )}
    </div>
  )
}
