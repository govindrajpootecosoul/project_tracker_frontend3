import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { to, cc, subject, body: emailBody } = body

    if (!to || !subject || !emailBody) {
      return NextResponse.json({ error: 'To, subject, and body are required' }, { status: 400 })
    }

    // Store email log in database (mock email sending)
    const emailLog = await prisma.emailLog.create({
      data: {
        to: JSON.stringify([to]),
        cc: cc ? JSON.stringify([cc]) : null,
        subject,
        body: emailBody,
        userId: session.user.id,
      },
    })

    // In a real application, you would send the email here using nodemailer or similar
    // For now, we just log it to the database

    return NextResponse.json({ message: 'Email sent successfully', emailLog }, { status: 201 })
  } catch (error) {
    console.error('Error sending email:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


