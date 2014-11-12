services = {
'ftp':21,
'ssh':22,
'smtp':25,
'domain':53,
'http':80,
'pop3':110,
'imap':143,
'https':443
}

return_codes = {
'OK':0,
'ERROR':1,
'TARGET_ERROR':50,      #Defined target error
'NOTSURE':100           #Service version detection inconclusive => possibly n/a
}
