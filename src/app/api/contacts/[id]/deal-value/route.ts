import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToPostgres } from "@/lib/postgres";
import { captureException, logger, motivo } from "@/lib/logger";
import { updateContact } from "@/lib/repositories/contactRepo";
import { DEMO_MODE, dbUnavailableResponse } from "@/lib/demo";
import { requireUserPermission } from "@/lib/auth";

const dealValueSchema = z.object({
  dealValue: z
    .number({ error: "El valor estimado debe ser un número" })
    .finite("Valor inválido")
    .min(0, "El valor estimado no puede ser negativo"),
});

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireUserPermission(req, "write");
  if (denied) return denied;

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID de contacto requerido" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const parsed = dealValueSchema.safeParse({
      dealValue: Number(body?.dealValue),
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Valor estimado inválido",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({
          success: true,
          source: "demo",
          data: { id, dealValue: parsed.data.dealValue },
        });
      }
      return dbUnavailableResponse();
    }

    const updated = await updateContact(db, id, {
      dealValue: parsed.data.dealValue,
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Contacto no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      source: "postgres",
      data: updated,
    });
  } catch (error: any) {
    const errorId = captureException(error, {
      route: "/api/contacts/[id]/deal-value",
      method: "PUT",
    });
    logger.error("Error in PUT /api/contacts/[id]/deal-value", {
      motivo: motivo(error),
    });
    return NextResponse.json(
      { success: false, error: "Error interno del servidor", errorId },
      { status: 500 },
    );
  }
}
