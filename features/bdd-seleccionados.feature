# language: es

Característica: Validación de reglas funcionales críticas de DisfracesPro
  Como equipo de desarrollo de DisfracesPro
  Quiero validar automáticamente reglas críticas del negocio
  Para asegurar que los criterios de aceptación se cumplen antes de liberar el sistema


  @BDD-01 @HU-03 @CA-03.4 @TC-BE-AUTH-05
  Escenario: Rechazar el registro cuando los datos están duplicados
    Dado que existe un usuario registrado con el correo "cliente@disfracespro.test"
    Cuando intento registrar otro usuario con el correo "cliente@disfracespro.test"
    Entonces el registro debe ser rechazado
    Y no debe crearse un segundo usuario con el mismo correo


  @BDD-02 @HU-04 @CA-04.2 @TC-BE-AUTH-07
  Escenario: Rechazar una contraseña incorrecta sin revelar información sensible
    Dado que existe un usuario activo con credenciales válidas
    Cuando intento iniciar sesión con una contraseña incorrecta
    Entonces la autenticación debe ser rechazada
    Y el mensaje no debe revelar información sensible de la cuenta


  @BDD-03 @HU-05 @CA-05.3 @TC-BE-AUTH-12
  Escenario: Rechazar el refresh token después de cerrar la sesión
    Dado que un usuario tiene una sesión activa
    Y el usuario cierra su sesión
    Cuando intenta renovar la sesión utilizando el refresh token cerrado
    Entonces la renovación de la sesión debe ser rechazada


  @BDD-04 @HU-06 @CA-06.2 @TC-BE-CAT-02
  Escenario: Mostrar un resultado vacío cuando el catálogo no tiene coincidencias
    Dado que existen disfraces disponibles en el catálogo
    Cuando busco en el catálogo un término que no coincide con ningún disfraz
    Entonces la búsqueda debe devolver una lista vacía
    Y no debe producirse un error


  @BDD-05 @HU-14 @CA-14.3 @TC-BE-SUS-03
  Escenario: Mantener incompleto un disfraz cuando no existe candidato de reemplazo
    Dado que un disfraz necesita reemplazar una de sus prendas
    Y no existe una prenda candidata compatible disponible
    Cuando se intenta realizar la sustitución
    Entonces no debe registrarse una sustitución
    Y el disfraz debe permanecer incompleto


  @BDD-06 @HU-20 @CA-20.3 @TC-BE-DEV-03
  Escenario: Impedir una devolución cuando no se reportan todas las prendas
    Dado que un cliente tiene un alquiler con dos prendas
    Cuando intenta registrar la devolución reportando solamente una de las prendas
    Entonces la devolución debe ser rechazada
    Y debe indicarse que se debe reportar el estado de todas las prendas del alquiler


  @BDD-07 @HU-28 @CA-28.5 @TC-BE-BUS-05
  Escenario: Buscar disfraces utilizando lenguaje de negocio
    Dado que existen disfraces asociados a términos de búsqueda del negocio
    Cuando el usuario realiza una búsqueda utilizando un término equivalente
    Entonces deben mostrarse los disfraces relacionados con la intención de búsqueda


  @BDD-08 @HU-29 @CA-29.4 @TC-BE-ARM-05
  Escenario: Impedir el armado cuando falta una pieza de la talla solicitada
    Dado que se solicita armar un disfraz para una talla determinada
    Y falta una pieza obligatoria compatible con la talla solicitada
    Cuando se intenta armar el disfraz
    Entonces el armado no debe completarse
    Y debe informarse que faltan piezas compatibles


  @BDD-09 @HU-37 @CA-37.5 @TC-BE-AJU-06
  Escenario: Rechazar un ajuste de talla cuando no existen suficientes prendas donantes
    Dado que un disfraz requiere varias piezas para realizar un ajuste de talla
    Y no existen suficientes prendas donantes compatibles
    Cuando el usuario solicita el ajuste de talla
    Entonces la solicitud debe ser rechazada
    Y no debe crearse un ajuste incompleto